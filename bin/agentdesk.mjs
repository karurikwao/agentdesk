#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { readFile } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const distRoot = resolve(projectRoot, "dist");
const launchRoot = process.cwd();
const runtimeVersion = "0.6.1";
const mcpProtocolVersion = "2025-11-25";
const maxBodyBytes = 512 * 1024;
const maxOutputBytes = 96 * 1024;
const defaultTimeoutMs = 15000;
const args = new Map(
  process.argv.slice(2).flatMap((arg, index, allArgs) => {
    if (!arg.startsWith("--")) {
      return [];
    }

    const [key, inlineValue] = arg.slice(2).split("=");
    const value = inlineValue ?? allArgs[index + 1] ?? "";
    return [[key, value]];
  })
);

if (args.has("help")) {
  console.log("Usage: agentdesk [--port 5173] [--host 127.0.0.1]");
  process.exit(0);
}

const port = validatePort(args.get("port") ?? process.env.AGENTDESK_PORT ?? "5173");
const host = validateHost(args.get("host") ?? process.env.AGENTDESK_HOST ?? "127.0.0.1");

if (!existsSync(join(distRoot, "index.html"))) {
  console.error("AgentDesk dist build not found. Run `npm run build` before starting the packaged CLI.");
  process.exit(1);
}

const server = createServer(async (request, response) => {
  let requestedPath = "/";

  try {
    requestedPath = decodeURIComponent(new URL(request.url ?? "/", `http://${host}`).pathname);
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad Request");
    return;
  }

  if (requestedPath.startsWith("/api/runtime")) {
    await handleRuntimeRequest(request, response, requestedPath);
    return;
  }

  if (requestedPath.startsWith("/api/")) {
    sendJson(response, 404, {
      error: "Unknown AgentDesk API route."
    });
    return;
  }

  const safePath = normalize(requestedPath.replace(/^\/+/, "") || "index.html").replace(
    /^(\.\.[\\/])+/,
    ""
  );
  const filePath = resolve(distRoot, safePath);

  if (!filePath.startsWith(distRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const targetPath =
    existsSync(filePath) && statSync(filePath).isFile() ? filePath : join(distRoot, "index.html");
  response.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https: http://127.0.0.1:11434 http://localhost:11434");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Type", contentType(targetPath));
  createReadStream(targetPath)
    .on("error", async () => {
      response.writeHead(500);
      response.end(await readFile(join(distRoot, "index.html"), "utf8"));
    })
    .pipe(response);
});

server.listen(Number(port), host, () => {
  console.log(`AgentDesk is running at http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error(`Unable to start AgentDesk: ${error.message}`);
  process.exit(1);
});

function validatePort(value) {
  const portNumber = Number(value);

  if (!Number.isInteger(portNumber) || portNumber < 1024 || portNumber > 65535) {
    console.error("AGENTDESK_PORT must be an integer between 1024 and 65535.");
    process.exit(1);
  }

  return String(portNumber);
}

function validateHost(value) {
  if (value !== "127.0.0.1" && value !== "localhost") {
    console.error("AGENTDESK_HOST must be 127.0.0.1 or localhost.");
    process.exit(1);
  }

  return value;
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "text/html; charset=utf-8";
  }
}

async function handleRuntimeRequest(request, response, requestedPath) {
  if (!isLoopbackRequest(request)) {
    sendJson(response, 403, { error: "Runtime API only accepts loopback Host and Origin headers." });
    return;
  }

  if (request.method === "GET" && requestedPath === "/api/runtime/status") {
    sendJson(response, 200, {
      available: true,
      enabled: true,
      version: runtimeVersion,
      capabilities: [
        "local-command-exec",
        "mcp-stdio-initialize",
        "mcp-tools-list",
        "mcp-tools-call",
        "mcp-streamable-http-probe"
      ],
      message: "AgentDesk local runtime is available on loopback."
    });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Runtime API route requires POST." });
    return;
  }

  if (request.headers["x-agentdesk-runtime"] !== "1") {
    sendJson(response, 403, { error: "Missing X-AgentDesk-Runtime header." });
    return;
  }

  if (!String(request.headers["content-type"] ?? "").toLowerCase().includes("application/json")) {
    sendJson(response, 415, { error: "Runtime API route requires application/json." });
    return;
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : "Invalid JSON body." });
    return;
  }

  try {
    if (requestedPath === "/api/runtime/execute-node") {
      const event = await executeRuntimeNode(body);
      sendJson(response, 200, { event });
      return;
    }

    if (requestedPath === "/api/runtime/mcp/discover") {
      const result = await discoverMcpFromBody(body);
      sendJson(response, result.status === "available" ? 200 : 502, result);
      return;
    }

    sendJson(response, 404, { error: "Unknown runtime route." });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? redactText(error.message) : "Runtime request failed." });
  }
}

async function executeRuntimeNode(body) {
  if (body?.approved !== true) {
    throw new Error("Runtime execution requires explicit approval from the AgentDesk UI.");
  }

  const workflow = body.workflow ?? {};
  const node = body.node;

  if (!node?.id || !node?.data) {
    throw new Error("Runtime execution requires a workflow node.");
  }

  const started = Date.now();

  if (node.data.kind === "tool" && node.data.provider === "mcp") {
    const result = await discoverMcpFromBody({
      approved: true,
      serverId: node.data.config?.mcpServerId ?? node.data.config?.serverId,
      mcpConfigText: body.mcpConfigText,
      toolName: node.data.config?.toolName,
      toolInputJson: node.data.config?.toolInputJson
    });

    if (result.status !== "available" || result.toolResult?.isError === true) {
      return createRuntimeTraceEvent({ workflow, node, body, started, status: "failed", result });
    }

    return createRuntimeTraceEvent({ workflow, node, body, started, status: "complete", result });
  }

  if (node.data.provider === "local" || node.data.kind === "tool") {
    const result = await runLocalCommandForNode(node);
    return createRuntimeTraceEvent({
      workflow,
      node,
      body,
      started,
      status: result.exitCode === 0 ? "complete" : "failed",
      result
    });
  }

  return createRuntimeTraceEvent({
    workflow,
    node,
    body,
    started,
    status: "complete",
    result: {
      kind: "runtime-metadata",
      message: `${node.data.label} completed as a deterministic local runtime metadata step.`,
      stdout: JSON.stringify({ nodeId: node.id, label: node.data.label, kind: node.data.kind }, null, 2),
      stderr: "",
      exitCode: 0
    }
  });
}

async function runLocalCommandForNode(node) {
  const config = node.data.config ?? {};
  const command = stringValue(config.command);

  if (!command) {
    return {
      kind: "local-command",
      message: "No local command configured for this node.",
      stdout: "",
      stderr: "RUNTIME_CONFIG_REQUIRED: set node.data.config.command and optional argsJson.",
      exitCode: 1
    };
  }

  const args = parseArgsConfig(config);
  const cwd = resolveRuntimeCwd(stringValue(config.cwd));
  const timeoutMs = clampTimeout(Number(config.timeoutMs ?? node.data.timeoutMs ?? defaultTimeoutMs));
  return runProcess({
    command,
    args,
    cwd,
    env: {},
    timeoutMs
  });
}

async function discoverMcpFromBody(body) {
  if (body?.approved !== true) {
    throw new Error("MCP discovery requires explicit approval from the AgentDesk UI.");
  }

  const serverId = stringValue(body.serverId);
  const configText = stringValue(body.mcpConfigText);

  if (!serverId || !configText) {
    return failedMcpDiscovery(serverId || "unknown", "Import an MCP config before live discovery or execution.");
  }

  const server = readRawMcpServer(configText, serverId);

  if (!server) {
    return failedMcpDiscovery(serverId, "No matching MCP server was found in the current in-memory config.");
  }

  try {
    if (server.url) {
      return await discoverHttpMcp(serverId, server, body);
    }

    if (server.command) {
      return await discoverStdioMcp(serverId, server, body);
    }

    return failedMcpDiscovery(serverId, "MCP server needs either command or url.");
  } catch (error) {
    return failedMcpDiscovery(serverId, error instanceof Error ? error.message : "MCP discovery failed.");
  }
}

async function discoverStdioMcp(serverId, server, body) {
  const command = stringValue(server.command);
  const args = Array.isArray(server.args) ? server.args.map(String) : [];
  const cwd = resolveRuntimeCwd(stringValue(server.cwd));
  const timeoutMs = clampTimeout(Number(server.timeoutMs ?? defaultTimeoutMs));
  const client = createStdioRpcClient({
    command,
    args,
    cwd,
    env: objectEnv(server.env),
    timeoutMs
  });

  try {
    const initialized = await client.request("initialize", initializeParams());
    await client.notify("notifications/initialized", {});
    const toolsResult = await listAllStdioMcpTools(client);
    const toolCall = await maybeCallMcpTool(client, body);
    return mcpDiscoveryFromResults(serverId, initialized, toolsResult, toolCall, client.stderr());
  } finally {
    await client.close();
  }
}

async function discoverHttpMcp(serverId, server, body) {
  const endpoint = new URL(String(server.url));

  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new Error("Remote MCP URL must use http or https.");
  }

  const headers = objectEnv(server.headers);
  const initialized = await httpMcpRequest(
    endpoint,
    headers,
    undefined,
    mcpProtocolVersion,
    1,
    "initialize",
    initializeParams()
  );
  const sessionId = initialized.sessionId;
  const negotiatedProtocolVersion = stringValue(initialized.payload?.protocolVersion) || mcpProtocolVersion;
  await httpMcpNotification(endpoint, headers, sessionId, negotiatedProtocolVersion, "notifications/initialized", {});
  const toolsResult = await listAllHttpMcpTools(endpoint, headers, sessionId, negotiatedProtocolVersion);
  const toolCall = body.toolName
    ? await httpMcpRequest(endpoint, headers, sessionId, negotiatedProtocolVersion, 1000, "tools/call", {
        name: stringValue(body.toolName),
        arguments: parseToolInput(body.toolInputJson)
      })
    : undefined;

  return mcpDiscoveryFromResults(serverId, initialized.payload, toolsResult, toolCall?.payload);
}

async function maybeCallMcpTool(client, body) {
  const toolName = stringValue(body.toolName);

  if (!toolName) {
    return undefined;
  }

  return client.request("tools/call", {
    name: toolName,
    arguments: parseToolInput(body.toolInputJson)
  });
}

async function listAllStdioMcpTools(client) {
  const tools = [];
  let nextCursor;

  for (let page = 0; page < 20; page += 1) {
    const result = await client.request("tools/list", nextCursor ? { cursor: nextCursor } : {});
    if (Array.isArray(result?.tools)) {
      tools.push(...result.tools);
    }

    nextCursor = stringValue(result?.nextCursor);
    if (!nextCursor) {
      return {
        ...result,
        tools
      };
    }
  }

  throw new Error("MCP tools/list pagination exceeded the AgentDesk 20-page safety limit.");
}

function createStdioRpcClient({ command, args, cwd, env, timeoutMs }) {
  const child = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      ...env
    },
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  let nextId = 1;
  let stdoutBuffer = "";
  let stderrBuffer = "";
  const pending = new Map();

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    let newline = stdoutBuffer.indexOf("\n");

    while (newline >= 0) {
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (line) {
        handleRpcLine(line, pending);
      }
      newline = stdoutBuffer.indexOf("\n");
    }
  });

  child.stderr.on("data", (chunk) => {
    stderrBuffer = capText(stderrBuffer + chunk.toString("utf8"));
  });

  child.on("error", (error) => {
    for (const request of pending.values()) {
      request.reject(error);
    }
    pending.clear();
  });

  return {
    request(method, params) {
      const id = nextId;
      nextId += 1;
      return new Promise((resolveRequest, rejectRequest) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          rejectRequest(new Error(`MCP stdio request timed out: ${method}`));
        }, timeoutMs);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolveRequest(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            rejectRequest(error);
          }
        });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    },
    notify(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    },
    stderr() {
      return stderrBuffer;
    },
    async close() {
      child.stdin.end();
      await wait(80);
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }
  };
}

function handleRpcLine(line, pending) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (typeof message.id === "number" && pending.has(message.id)) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      request.reject(new Error(message.error.message ?? "MCP JSON-RPC error"));
    } else {
      request.resolve(message.result ?? {});
    }
  }
}

async function listAllHttpMcpTools(endpoint, headers, sessionId, protocolVersion) {
  const tools = [];
  let nextCursor;

  for (let page = 0; page < 20; page += 1) {
    const result = await httpMcpRequest(
      endpoint,
      headers,
      sessionId,
      protocolVersion,
      page + 2,
      "tools/list",
      nextCursor ? { cursor: nextCursor } : {}
    );
    if (Array.isArray(result.payload?.tools)) {
      tools.push(...result.payload.tools);
    }

    nextCursor = stringValue(result.payload?.nextCursor);
    if (!nextCursor) {
      return {
        ...result.payload,
        tools
      };
    }
  }

  throw new Error("Remote MCP tools/list pagination exceeded the AgentDesk 20-page safety limit.");
}

async function httpMcpRequest(endpoint, headers, sessionId, protocolVersion, id, method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...headers,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": protocolVersion,
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {})
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(defaultTimeoutMs)
  });
  const payload = await parseMcpHttpResponse(response, id);
  return {
    payload,
    sessionId: response.headers.get("mcp-session-id") ?? sessionId
  };
}

async function httpMcpNotification(endpoint, headers, sessionId, protocolVersion, method, params) {
  await fetch(endpoint, {
    method: "POST",
    headers: {
      ...headers,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": protocolVersion,
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {})
    },
    body: JSON.stringify({ jsonrpc: "2.0", method, params }),
    signal: AbortSignal.timeout(defaultTimeoutMs)
  });
}

async function parseMcpHttpResponse(response, id) {
  const contentTypeHeader = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Remote MCP returned HTTP ${response.status}: ${redactText(text.slice(0, 240))}`);
  }

  if (contentTypeHeader.includes("text/event-stream")) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith("data:")) {
        continue;
      }
      const message = JSON.parse(line.slice(5).trim());
      if (message.id === id) {
        if (message.error) {
          throw new Error(message.error.message ?? "Remote MCP JSON-RPC error");
        }
        return message.result ?? {};
      }
    }
    throw new Error("Remote MCP SSE response did not include the expected JSON-RPC result.");
  }

  const message = JSON.parse(text);
  if (message.error) {
    throw new Error(message.error.message ?? "Remote MCP JSON-RPC error");
  }
  return message.result ?? {};
}

function mcpDiscoveryFromResults(serverId, initialized, toolsResult, toolCall, stderr = "") {
  const toolDescriptors = Array.isArray(toolsResult?.tools)
    ? toolsResult.tools.map(normalizeToolDescriptor).filter(Boolean)
    : [];
  const tools = toolDescriptors.map((tool) => tool.name);
  const serverInfo = initialized?.serverInfo
    ? `${initialized.serverInfo.name ?? "server"} ${initialized.serverInfo.version ?? ""}`.trim()
    : undefined;

  return {
    serverId,
    status: "available",
    message: toolCall
      ? toolCall.isError === true
        ? `Discovered ${tools.length} tool(s), but the selected MCP tool reported an execution error.`
        : `Discovered ${tools.length} tool(s) and called ${toolCall.name ?? "selected tool"}.`
      : `Discovered ${tools.length} MCP tool(s).`,
    tools,
    toolDescriptors,
    resources: [],
    prompts: [],
    serverInfo,
    protocolVersion: initialized?.protocolVersion,
    toolResult: toolCall,
    stderr: redactText(stderr)
  };
}

function normalizeToolDescriptor(tool) {
  if (!tool || typeof tool !== "object" || !tool.name) {
    return undefined;
  }

  return redactValue({
    name: String(tool.name),
    title: stringValue(tool.title),
    description: stringValue(tool.description),
    inputSchema: tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : undefined,
    outputSchema: tool.outputSchema && typeof tool.outputSchema === "object" ? tool.outputSchema : undefined,
    annotations: tool.annotations && typeof tool.annotations === "object" ? tool.annotations : undefined,
    execution: tool.execution && typeof tool.execution === "object" ? tool.execution : undefined
  });
}

function createRuntimeTraceEvent({ workflow, node, body, started, status, result }) {
  const durationMs = Date.now() - started;
  const provider = node.data.provider;
  const message = result.message ?? (status === "complete" ? "Runtime step completed." : "Runtime step failed.");
  const stdout = redactText(result.stdout ?? JSON.stringify(result, null, 2));
  const stderr = redactText(result.stderr ?? "");
  const artifacts = [
    {
      id: `${node.id}-runtime-json-${Date.now()}`,
      name: `${node.data.label} runtime payload`,
      type: "json",
      uri: `artifact://runtime/${node.id}/payload.json`,
      content: JSON.stringify(redactValue(result), null, 2)
    }
  ];

  if (stdout) {
    artifacts.push({
      id: `${node.id}-runtime-stdout-${Date.now()}`,
      name: `${node.data.label} stdout`,
      type: "stdout",
      uri: `artifact://runtime/${node.id}/stdout.log`,
      content: stdout
    });
  }

  if (stderr || status === "failed") {
    artifacts.push({
      id: `${node.id}-runtime-stderr-${Date.now()}`,
      name: `${node.data.label} stderr`,
      type: "stderr",
      uri: `artifact://runtime/${node.id}/stderr.log`,
      content: stderr || message
    });
  }

  return {
    id: `${workflow.id ?? "workflow"}-${node.id}-runtime-${Date.now()}`,
    runId: body.runId ?? `run-${Date.now()}`,
    nodeId: node.id,
    nodeLabel: node.data.label,
    kind: node.data.kind,
    status,
    startedAt: new Date(started).toISOString(),
    durationMs,
    provider,
    model: node.data.model ?? (provider === "mcp" ? "mcp-runtime" : "local-runtime"),
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    summary: message,
    artifact: artifacts[0]?.uri,
    artifacts,
    debug: {
      prompt: node.data.promptTemplate ?? node.data.description ?? "",
      toolCall: JSON.stringify(
        redactValue({
          provider,
          kind: node.data.kind,
          config: node.data.config ?? {}
        }),
        null,
        2
      ),
      result: message,
      stdout,
      stderr: stderr || undefined
    },
    inputRef: `input://${workflow.id ?? "workflow"}/${node.id}`,
    outputRef: status === "complete" ? `output://${workflow.id ?? "workflow"}/${node.id}` : undefined,
    inputPreview: `Runtime executed ${node.data.label}.`,
    outputPreview: status === "complete" ? message : undefined,
    error:
      status === "failed"
        ? {
            code: result.exitCode === undefined ? "RUNTIME_ERROR" : `EXIT_${result.exitCode}`,
            message
          }
        : undefined
  };
}

function runProcess({ command, args, cwd, env, timeoutMs }) {
  if (isShellCommand(command) && process.env.AGENTDESK_ALLOW_SHELL !== "1") {
    return Promise.resolve({
      kind: "local-command",
      message: "Shell commands are blocked unless AGENTDESK_ALLOW_SHELL=1 is set before starting AgentDesk.",
      stdout: "",
      stderr: "RUNTIME_SHELL_BLOCKED",
      exitCode: 1
    });
  }

  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env
      },
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = capText(stdout + chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk) => {
      stderr = capText(stderr + chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({
        kind: "local-command",
        message: redactText(error.message),
        stdout,
        stderr: redactText(stderr || error.message),
        exitCode: 1
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const exitCode = timedOut ? 124 : code ?? 0;
      resolveRun({
        kind: "local-command",
        message: timedOut
          ? `Command timed out after ${timeoutMs}ms.`
          : exitCode === 0
            ? "Local command completed."
            : `Local command exited with code ${exitCode}.`,
        stdout: redactText(stdout),
        stderr: redactText(stderr),
        exitCode
      });
    });
  });
}

function readRawMcpServer(input, serverId) {
  const parsed = JSON.parse(input);
  const roots = [parsed.mcpServers, parsed.servers, parsed.mcp?.servers].filter(
    (root) => root && typeof root === "object" && !Array.isArray(root)
  );

  for (const root of roots) {
    if (root[serverId] && typeof root[serverId] === "object") {
      return root[serverId];
    }
  }

  if (serverId === "imported-server" && (parsed.command || parsed.url)) {
    return parsed;
  }

  return undefined;
}

function initializeParams() {
  return {
    protocolVersion: mcpProtocolVersion,
    capabilities: {},
    clientInfo: {
      name: "AgentDesk",
      title: "AgentDesk Local Runtime",
      version: runtimeVersion
    }
  };
}

function failedMcpDiscovery(serverId, message) {
  return {
    serverId,
    status: "failed",
    message: redactText(message),
    tools: [],
    resources: [],
    prompts: []
  };
}

function parseToolInput(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  return JSON.parse(String(value));
}

function parseArgsConfig(config) {
  if (typeof config.argsJson === "string" && config.argsJson.trim()) {
    const parsed = JSON.parse(config.argsJson);
    if (!Array.isArray(parsed)) {
      throw new Error("argsJson must be a JSON array.");
    }
    return parsed.map(String);
  }

  if (typeof config.args === "string" && config.args.trim()) {
    return config.args.split(/\s+/).filter(Boolean);
  }

  return [];
}

function resolveRuntimeCwd(rawCwd) {
  const cwd = rawCwd ? resolve(launchRoot, rawCwd) : launchRoot;
  const relativePath = relative(launchRoot, cwd);

  if (relativePath.startsWith("..") || relativePath === ".." || resolve(relativePath) === relativePath) {
    throw new Error("Runtime cwd must stay inside the directory where AgentDesk was started.");
  }

  return cwd;
}

function objectEnv(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isDangerousKey(key))
      .map(([key, entry]) => [key, String(entry)])
  );
}

function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let text = "";
    request.on("data", (chunk) => {
      text += chunk.toString("utf8");
      if (Buffer.byteLength(text) > maxBodyBytes) {
        rejectBody(new Error("Runtime request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolveBody(text ? JSON.parse(text) : {});
      } catch {
        rejectBody(new Error("Runtime request body must be valid JSON."));
      }
    });
    request.on("error", rejectBody);
  });
}

function isLoopbackRequest(request) {
  const hostHeader = String(request.headers.host ?? "").split(":")[0].toLowerCase();
  let origin;

  try {
    origin = request.headers.origin ? new URL(String(request.headers.origin)) : undefined;
  } catch {
    return false;
  }

  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(hostHeader)) {
    return false;
  }

  if (origin && !["127.0.0.1", "localhost", "[::1]", "::1"].includes(origin.hostname.toLowerCase())) {
    return false;
  }

  return true;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function capText(value) {
  return value.length > maxOutputBytes ? `${value.slice(0, maxOutputBytes)}\n[agentdesk:truncated]` : value;
}

function clampTimeout(value) {
  return Number.isFinite(value) ? Math.max(500, Math.min(60000, value)) : defaultTimeoutMs;
}

function isShellCommand(command) {
  const base = command.toLowerCase().split(/[\\/]/).pop();
  return ["cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe", "bash", "sh"].includes(base ?? "");
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function isDangerousKey(key) {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function redactValue(value) {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, isSensitiveKey(key) ? "[REDACTED]" : redactValue(entry)])
    );
  }

  if (typeof value === "string") {
    return redactText(value);
  }

  return value;
}

function redactText(value) {
  return redactPathPrefixes(String(value))
    .replace(/(api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|client[-_]?secret|private[-_]?key|secret|token|password|x-api-key|xApiKey|databaseUrl|database_url)(=|:)\s*[^,\s"']+/gi, "$1$2[REDACTED]")
    .replace(/\bbearer\s+[A-Za-z0-9._-]{10,}\b/gi, "Bearer [REDACTED]")
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED]");
}

function isSensitiveKey(key) {
  return /api[-_\s]?key|apikey|access[-_\s]?token|refresh[-_\s]?token|authorization|bearer|client[-_\s]?secret|cookie|jwt|password|private[-_\s]?key|secret|session|token|x[-_\s]?api[-_\s]?key|database[-_\s]?url|databaseurl/i.test(
    key
  );
}

function redactPathPrefixes(value) {
  return value
    .replace(/[A-Z]:\\+Users\\+[^\\/"'\s]+/gi, "${userHome}")
    .replace(/[A-Z]:\\Users\\[^\\/]+/gi, "${userHome}")
    .replace(/\/Users\/[^/\s"']+/g, "${userHome}")
    .replace(/\/home\/[^/\s"']+/g, "${userHome}");
}
