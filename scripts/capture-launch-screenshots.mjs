import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const assetsDir = resolve(root, "docs", "assets");
const port = Number(process.env.AGENTDESK_SCREENSHOT_PORT ?? await getFreePort());
const baseUrl = `http://127.0.0.1:${port}`;

await mkdir(assetsDir, { recursive: true });

const server = spawn(process.execPath, ["./bin/agentdesk.mjs", "--port", String(port), "--host", "127.0.0.1"], {
  cwd: root,
  stdio: "pipe"
});

try {
  await waitForServer(baseUrl);
  await captureScreenshots();
} finally {
  server.kill();
  await waitForExit(server, 5000).catch(() => undefined);
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

    await page.setViewportSize({ width: 1200, height: 630 });
    await page.setContent(socialCardHtml(), { waitUntil: "load" });
    await page.screenshot({
      path: resolve(assetsDir, "agentdesk-social-card.png"),
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

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const selectedPort = typeof address === "object" && address ? address.port : undefined;
      probe.close(() => {
        if (selectedPort) {
          resolvePort(selectedPort);
        } else {
          reject(new Error("Unable to allocate a free local port."));
        }
      });
    });
  });
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolveExit, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for screenshot server exit.")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveExit();
    });
  });
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

function socialCardHtml() {
  const screenshotUrl = `data:image/png;base64,${readFileSync(resolve(assetsDir, "agentdesk-start-here.png")).toString("base64")}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      * {
        box-sizing: border-box;
      }

      body {
        display: grid;
        width: 1200px;
        height: 630px;
        margin: 0;
        overflow: hidden;
        color: #0f172a;
        background:
          linear-gradient(135deg, rgba(37, 99, 235, 0.2), transparent 34%),
          linear-gradient(315deg, rgba(14, 165, 233, 0.18), transparent 38%),
          #eef4ff;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .card {
        display: grid;
        grid-template-columns: 1fr 500px;
        gap: 34px;
        align-items: center;
        padding: 58px;
      }

      .copy {
        display: grid;
        gap: 20px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 14px;
        font-size: 28px;
        font-weight: 900;
      }

      .mark {
        display: grid;
        width: 56px;
        height: 56px;
        place-items: center;
        border-radius: 8px;
        color: #ffffff;
        background: linear-gradient(135deg, #2563eb, #7c3aed);
      }

      h1 {
        max-width: 590px;
        margin: 0;
        font-size: 66px;
        line-height: 0.96;
        letter-spacing: 0;
      }

      p {
        max-width: 580px;
        margin: 0;
        color: #475569;
        font-size: 25px;
        line-height: 1.32;
      }

      .chips {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .chip {
        padding: 10px 12px;
        border-radius: 8px;
        color: #1d4ed8;
        background: #dbeafe;
        font-size: 20px;
        font-weight: 850;
      }

      .chip:nth-child(2) {
        color: #6d28d9;
        background: #ede9fe;
      }

      .chip:nth-child(3) {
        color: #047857;
        background: #ccfbf1;
      }

      .shot {
        overflow: hidden;
        border: 1px solid #dbe4f0;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 30px 80px rgba(15, 23, 42, 0.22);
      }

      .shot img {
        display: block;
        width: 760px;
        max-width: none;
        transform: translateX(-145px);
      }
    </style>
  </head>
  <body>
    <div class="card">
      <section class="copy">
        <div class="brand"><span class="mark">AD</span><span>AgentDesk</span></div>
        <h1>Replay failed AI agent runs.</h1>
        <p>Click trace to graph, inspect prompt/tool/result artifacts, and export redacted evidence.</p>
        <div class="chips">
          <span class="chip">MCP 2025-11-25</span>
          <span class="chip">Local Runtime</span>
          <span class="chip">BYOK + Ollama</span>
        </div>
      </section>
      <section class="shot">
        <img src="${screenshotUrl}" alt="AgentDesk app screenshot" />
      </section>
    </div>
  </body>
</html>`;
}
