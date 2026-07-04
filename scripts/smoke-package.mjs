import { mkdtemp, rm, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const tempRoot = await mkdtemp(join(tmpdir(), "agentdesk-package-smoke-"));
let tarballPath;
let server;

try {
  if (!existsSync(join(root, "dist", "index.html"))) {
    throw new Error("dist/index.html is missing. Run npm run build before package smoke.");
  }

  const pack = runNpm(["pack", "--ignore-scripts", "--json", "--pack-destination", tempRoot], root);

  if (pack.status !== 0) {
    throw new Error(`npm pack failed:\n${formatResult(pack)}`);
  }

  const [packed] = JSON.parse(pack.stdout);
  tarballPath = join(tempRoot, packed.filename);

  const install = runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath], tempRoot);

  if (install.status !== 0) {
    throw new Error(`npm install smoke failed:\n${formatResult(install)}`);
  }

  const shimPath = join(
    tempRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "agentdesk.cmd" : "agentdesk"
  );
  const helpCommand = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : shimPath;
  const helpArgs =
    process.platform === "win32"
      ? ["/d", "/c", shimPath, "--help"]
      : ["--help"];
  const help = spawnSync(helpCommand, helpArgs, {
    cwd: root,
    encoding: "utf8"
  });

  if (help.status !== 0 || !String(help.stdout).includes("Usage: agentdesk")) {
    throw new Error(`installed agentdesk command failed:\n${formatResult(help)}`);
  }

  const cliPath = join(tempRoot, "node_modules", "agentdesk", "bin", "agentdesk.mjs");
  const port = String(await getFreePort());
  const output = { stdout: "", stderr: "" };
  server = spawn(process.execPath, [cliPath, "--port", port, "--host", "127.0.0.1"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout?.on("data", (chunk) => {
    output.stdout += String(chunk);
  });
  server.stderr?.on("data", (chunk) => {
    output.stderr += String(chunk);
  });

  await waitForServer(`http://127.0.0.1:${port}`, server, output);

  const response = await fetch(`http://127.0.0.1:${port}`);
  const html = await response.text();

  if (!response.ok || !html.includes("AgentDesk")) {
    throw new Error(`Packaged CLI served an unexpected response: HTTP ${response.status}`);
  }

  console.log(`Package smoke passed on http://127.0.0.1:${port}`);
} finally {
  if (server) {
    server.kill();
    await waitForExit(server, 5_000).catch(() => undefined);
  }

  if (tarballPath) {
    await unlink(tarballPath).catch(() => undefined);
  }

  await rm(tempRoot, { recursive: true, force: true });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      probe.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new Error("Unable to allocate a free local port."));
        }
      });
    });
  });
}

function runNpm(args, cwd) {
  return spawnSync(npmCommand, npmExecPath ? [npmExecPath, ...args] : args, {
    cwd,
    encoding: "utf8"
  });
}

function formatResult(result) {
  return result.error?.message ?? result.stderr ?? result.stdout ?? `exit ${result.status}`;
}

async function waitForServer(url, child, output) {
  const deadline = Date.now() + 15_000;
  let lastError;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged CLI exited early with code ${child.exitCode}:\n${output.stderr || output.stdout}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for packaged CLI at ${url}: ${lastError?.message ?? "no response"}`);
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for child process exit.")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
