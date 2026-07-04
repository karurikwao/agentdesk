import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = String(await getFreePort());
const baseURL = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["./bin/agentdesk.mjs", "--port", port, "--host", "127.0.0.1"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"]
});
const output = { stdout: "", stderr: "" };

server.stdout?.on("data", (chunk) => {
  output.stdout += String(chunk);
});
server.stderr?.on("data", (chunk) => {
  output.stderr += String(chunk);
});

try {
  await waitForServer(baseURL, server, output);
  const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      AGENTDESK_E2E_BASE_URL: baseURL
    }
  });

  process.exitCode = result.status ?? 1;
} finally {
  server.kill();
  await waitForExit(server, 5_000).catch(() => undefined);
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

async function waitForServer(url, child, output) {
  const deadline = Date.now() + 15_000;
  let lastError;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`AgentDesk e2e server exited early with code ${child.exitCode}:\n${output.stderr || output.stdout}`);
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

  throw new Error(`Timed out waiting for AgentDesk e2e server at ${url}: ${lastError?.message ?? "no response"}`);
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolveExit, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for e2e server exit.")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveExit();
    });
  });
}
