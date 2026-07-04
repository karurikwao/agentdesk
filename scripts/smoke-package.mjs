import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageName = "@papaplus/agentdesk";
const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const tempRoot = await mkdtemp(join(tmpdir(), "agentdesk-package-smoke-"));
let tarballPath;
let server;
let httpMcpServer;

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

  const cliPath = join(tempRoot, "node_modules", ...packageName.split("/"), "bin", "agentdesk.mjs");
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

  const statusResponse = await fetch(`http://127.0.0.1:${port}/api/runtime/status`, {
    headers: {
      "X-AgentDesk-Runtime": "1"
    }
  });
  const runtimeStatus = await statusResponse.json();

  if (!statusResponse.ok || runtimeStatus.available !== true) {
    throw new Error(`Runtime status smoke failed: HTTP ${statusResponse.status}`);
  }

  const executeResponse = await fetch(`http://127.0.0.1:${port}/api/runtime/execute-node`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-AgentDesk-Runtime": "1"
    },
    body: JSON.stringify({
      approved: true,
      workflow: {
        id: "smoke",
        name: "Smoke",
        description: "Package smoke"
      },
      node: {
        id: "node-version",
        data: {
          label: "Node Version",
          kind: "tool",
          provider: "local",
          description: "Check Node runtime",
          config: {
            command: process.execPath,
            argsJson: "[\"--version\"]"
          }
        }
      },
      index: 0,
      runId: "smoke-run"
    })
  });
  const executePayload = await executeResponse.json();

  if (!executeResponse.ok || executePayload.event?.status !== "complete") {
    throw new Error(`Runtime execute smoke failed: HTTP ${executeResponse.status}`);
  }

  const stdioServerPath = join(tempRoot, "mcp-stdio-smoke.mjs");
  await writeFile(stdioServerPath, createStdioMcpServerSource(), "utf8");
  const stdioMcpConfigText = JSON.stringify({
    mcpServers: {
      "stdio-smoke": {
        command: process.execPath,
        args: [stdioServerPath]
      }
    }
  });
  const stdioDiscovery = await fetch(`http://127.0.0.1:${port}/api/runtime/mcp/discover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-AgentDesk-Runtime": "1"
    },
    body: JSON.stringify({
      approved: true,
      serverId: "stdio-smoke",
      toolName: "smoke_tool",
      toolInputJson: "{\"text\":\"stdio\"}",
      mcpConfigText: stdioMcpConfigText
    })
  });
  const stdioPayload = await stdioDiscovery.json();

  if (
    !stdioDiscovery.ok ||
    stdioPayload.status !== "available" ||
    !stdioPayload.tools?.includes("smoke_tool") ||
    stdioPayload.protocolVersion !== "2025-11-25" ||
    stdioPayload.toolDescriptors?.[0]?.execution?.taskSupport !== "optional"
  ) {
    throw new Error(`MCP stdio discovery smoke failed: HTTP ${stdioDiscovery.status}`);
  }

  const stdioErrorExecute = await fetch(`http://127.0.0.1:${port}/api/runtime/execute-node`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-AgentDesk-Runtime": "1"
    },
    body: JSON.stringify({
      approved: true,
      workflow: {
        id: "smoke",
        name: "Smoke",
        description: "Package smoke"
      },
      node: {
        id: "mcp-error",
        data: {
          label: "MCP Error Tool",
          kind: "tool",
          provider: "mcp",
          description: "Check MCP isError mapping",
          config: {
            mcpServerId: "stdio-smoke",
            toolName: "error_tool",
            toolInputJson: "{}"
          }
        }
      },
      index: 1,
      runId: "smoke-run",
      mcpConfigText: stdioMcpConfigText
    })
  });
  const stdioErrorPayload = await stdioErrorExecute.json();

  if (!stdioErrorExecute.ok || stdioErrorPayload.event?.status !== "failed") {
    throw new Error(`MCP isError execute smoke failed: HTTP ${stdioErrorExecute.status}`);
  }

  const httpMcpPort = await getFreePort();
  httpMcpServer = await startHttpMcpServer(httpMcpPort);
  const httpDiscovery = await fetch(`http://127.0.0.1:${port}/api/runtime/mcp/discover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-AgentDesk-Runtime": "1"
    },
    body: JSON.stringify({
      approved: true,
      serverId: "http-smoke",
      toolName: "smoke_tool",
      toolInputJson: "{\"text\":\"http\"}",
      mcpConfigText: JSON.stringify({
        mcpServers: {
          "http-smoke": {
            url: `http://127.0.0.1:${httpMcpPort}/mcp`,
            headers: {
              authorization: "Bearer smoke-secret"
            }
          }
        }
      })
    })
  });
  const httpPayload = await httpDiscovery.json();

  if (
    !httpDiscovery.ok ||
    httpPayload.status !== "available" ||
    !httpPayload.tools?.includes("smoke_tool") ||
    httpPayload.protocolVersion !== "2025-11-25" ||
    httpPayload.toolDescriptors?.[0]?.outputSchema?.type !== "object"
  ) {
    throw new Error(`MCP HTTP discovery smoke failed: HTTP ${httpDiscovery.status}`);
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

  if (httpMcpServer) {
    await closeServer(httpMcpServer).catch(() => undefined);
  }

  await rm(tempRoot, { recursive: true, force: true });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createTcpServer();
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

function createStdioMcpServerSource() {
  return [
    "let buffer = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => {",
    "  buffer += chunk;",
    "  let newline = buffer.indexOf('\\n');",
    "  while (newline >= 0) {",
    "    const line = buffer.slice(0, newline).trim();",
    "    buffer = buffer.slice(newline + 1);",
    "    if (line) handle(JSON.parse(line));",
    "    newline = buffer.indexOf('\\n');",
    "  }",
    "});",
    "function send(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n'); }",
    "function handle(message) {",
    "  if (message.method === 'initialize') {",
    "    send(message.id, { protocolVersion: '2025-11-25', serverInfo: { name: 'stdio-smoke', version: '1.0.0' }, capabilities: { tools: {} } });",
    "  } else if (message.method === 'tools/list') {",
    "    send(message.id, { tools: [{ name: 'smoke_tool', title: 'Smoke Tool', description: 'Smoke tool', inputSchema: { type: 'object' }, outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }, execution: { taskSupport: 'optional' } }, { name: 'error_tool', title: 'Error Tool', description: 'Returns isError for smoke coverage', inputSchema: { type: 'object' }, execution: { taskSupport: 'optional' } }] });",
    "  } else if (message.method === 'tools/call') {",
    "    if (message.params && message.params.name === 'error_tool') {",
    "      send(message.id, { content: [{ type: 'text', text: 'tool level error' }], isError: true });",
    "    } else {",
    "      send(message.id, { content: [{ type: 'text', text: 'stdio ok' }], structuredContent: { ok: true } });",
    "    }",
    "  }",
    "}"
  ].join("\n");
}

function startHttpMcpServer(port) {
  const server = createHttpServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};

    if (payload.method === "notifications/initialized") {
      response.writeHead(202);
      response.end();
      return;
    }

    const result =
      payload.method === "initialize"
        ? {
            protocolVersion: "2025-11-25",
            serverInfo: { name: "http-smoke", version: "1.0.0" },
            capabilities: { tools: {} }
          }
        : payload.method === "tools/list"
          ? {
              tools: [
                {
                  name: "smoke_tool",
                  title: "Smoke Tool",
                  description: "Smoke tool",
                  inputSchema: { type: "object" },
                  outputSchema: {
                    type: "object",
                    properties: { ok: { type: "boolean" } },
                    required: ["ok"]
                  },
                  execution: { taskSupport: "optional" }
                }
              ]
            }
          : { content: [{ type: "text", text: "http ok" }], structuredContent: { ok: true } };

    response.writeHead(200, {
      "Content-Type": "application/json",
      "Mcp-Session-Id": "smoke-session"
    });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }));
  });

  return new Promise((resolveServer, rejectServer) => {
    server.once("error", rejectServer);
    server.listen(port, "127.0.0.1", () => resolveServer(server));
  });
}

function closeServer(serverToClose) {
  return new Promise((resolveClose, rejectClose) => {
    serverToClose.close((error) => {
      if (error) {
        rejectClose(error);
      } else {
        resolveClose();
      }
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
