import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const assetsDir = resolve(root, "docs", "assets");
const port = Number(process.env.AGENTDESK_SCREENSHOT_PORT ?? 4174);
const baseUrl = `http://127.0.0.1:${port}`;

await mkdir(assetsDir, { recursive: true });

const serverCommand = process.platform === "win32"
  ? `npx.cmd vite preview --host 127.0.0.1 --port ${port} --strictPort`
  : "npx";
const serverArgs = process.platform === "win32"
  ? []
  : ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"];
const server = spawn(serverCommand, serverArgs, {
  cwd: root,
  stdio: "pipe",
  shell: process.platform === "win32"
});

try {
  await waitForServer(baseUrl);
  await captureScreenshots();
} finally {
  server.kill();
}

async function captureScreenshots() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  try {
    await page.goto(baseUrl);
    await page.getByRole("tab", { name: "Start" }).waitFor();
    await page.screenshot({
      path: resolve(assetsDir, "agentdesk-start-here.png"),
      fullPage: false
    });

    await selectWorkflow(page, "Local Research Agent");
    await page.getByRole("tab", { name: "LLMs" }).click();
    await page.getByLabel("OpenAI API key").fill("sk-your-key-stays-session-only");
    await page.screenshot({
      path: resolve(assetsDir, "agentdesk-llm-config.png"),
      fullPage: false
    });

    await selectWorkflow(page, "Failure Replay Lab");
    await page.getByRole("button", { name: "Run demo trace" }).click();
    await page.getByLabel("Node debugger").getByText("DEMO_TOOL_TIMEOUT").first().waitFor({ timeout: 15000 });
    await page.screenshot({
      path: resolve(assetsDir, "agentdesk-failure-debug.png"),
      fullPage: false
    });

    await page.getByRole("tab", { name: "Trace" }).click();
    await page.getByRole("button", { name: "Replay failed step" }).click();
    await page.getByRole("tab", { name: "Artifacts" }).click();
    await page
      .getByRole("button", { name: "Replay context: Browser Replay screenshot screenshot" })
      .click();
    await page.getByRole("img", { name: "Browser Replay screenshot" }).waitFor({ timeout: 10000 });
    await page.screenshot({
      path: resolve(assetsDir, "agentdesk-artifacts.png"),
      fullPage: false
    });
  } finally {
    await browser.close();
  }
}

async function selectWorkflow(page, name) {
  await page.getByLabel("Workflow controls").getByRole("button", { name }).click();
}

async function waitForServer(url) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < 30000) {
    if (server.exitCode !== null) {
      const stdout = await streamText(server.stdout);
      const stderr = await streamText(server.stderr);
      throw new Error(`Preview server exited early.\n${stdout}\n${stderr}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}

function streamText(stream) {
  return new Promise((resolveText) => {
    let text = "";
    stream?.on("data", (chunk) => {
      text += chunk.toString();
    });
    stream?.on("end", () => resolveText(text));
    setTimeout(() => resolveText(text), 100);
  });
}
