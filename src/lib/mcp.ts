import type { ImportedMcpServer } from "../types/workflow";

type McpServerConfig = {
  type?: string;
  transport?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  envFile?: string;
  url?: string;
  headers?: Record<string, string>;
  disabled?: boolean;
};

type McpConfig = {
  mcpServers?: Record<string, McpServerConfig>;
  servers?: Record<string, McpServerConfig>;
  mcp?: {
    servers?: Record<string, McpServerConfig>;
  };
  type?: string;
  transport?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  cwd?: string;
  envFile?: string;
  disabled?: boolean;
};

export type McpImportReport = {
  servers: ImportedMcpServer[];
  sourceFormat: "claude-desktop" | "vscode" | "nested-mcp" | "single-server";
  warnings: string[];
  redactedPreview: string;
};

export function parseMcpConfig(input: string): ImportedMcpServer[] {
  return parseMcpConfigReport(input).servers;
}

export function parseMcpConfigReport(input: string): McpImportReport {
  const parsed = JSON.parse(input) as McpConfig;
  const candidates = [
    ["claude-desktop", parsed.mcpServers],
    ["vscode", parsed.servers],
    ["nested-mcp", parsed.mcp?.servers]
  ] as const;
  const matches = candidates.filter(
    ([, source]) => isPlainRecord(source) && Object.keys(source).length > 0
  );
  const warnings: string[] = [];
  const emptyRoots = candidates.filter(
    ([, source]) => isPlainRecord(source) && Object.keys(source).length === 0
  );

  if (matches.length > 1) {
    warnings.push("Multiple MCP server roots found; AgentDesk imported the first supported root.");
  }

  if (emptyRoots.length > 0 && matches.length > 0) {
    warnings.push("Skipped an empty MCP server root.");
  }

  const [sourceFormat, source] = matches[0] ?? [];

  if (isPlainRecord(source)) {
    const servers = Object.entries(source)
      .filter(([id]) => !isDangerousKey(id))
      .filter(([, server]) => {
        const valid = isPlainRecord(server);
        if (!valid) {
          warnings.push("Skipped a malformed server entry.");
        }

        return valid;
      })
      .map(([id, server]) => normalizeServer(id, server));

    return {
      servers,
      sourceFormat,
      warnings,
      redactedPreview: redactMcpConfigText(input)
    };
  }

  if (parsed.command || parsed.url) {
    return {
      servers: [normalizeServer("imported-server", parsed)],
      sourceFormat: "single-server",
      warnings,
      redactedPreview: redactMcpConfigText(input)
    };
  }

  throw new Error("Expected mcpServers, servers, or a single MCP server object.");
}

export function redactMcpConfigText(input: string) {
  try {
    return JSON.stringify(redactObject(JSON.parse(input)), null, 2);
  } catch {
    return input;
  }
}

function normalizeServer(id: string, server: McpServerConfig): ImportedMcpServer {
  const command = typeof server.command === "string" ? server.command : "";
  const url = typeof server.url === "string" ? server.url : undefined;
  const type = inferTransport(server.type ?? server.transport, command, url);
  const rawArgs = Array.isArray(server.args) ? server.args.map(String) : [];
  const args = redactArgs(rawArgs);
  const envKeys = safeKeys(server.env);
  const headerKeys = safeKeys(server.headers);

  return {
    id,
    type,
    command: redactPathValue(command) ?? "",
    args,
    url: redactUrl(url),
    cwd: redactPathValue(server.cwd),
    envKeys,
    headerKeys,
    envFile: redactPathValue(server.envFile),
    disabled: Boolean(server.disabled),
    riskFlags: createRiskFlags({ command, args: rawArgs, url, envKeys, headerKeys }),
    readiness: createReadiness({
      type,
      command,
      url,
      disabled: Boolean(server.disabled),
      riskFlags: createRiskFlags({ command, args: rawArgs, url, envKeys, headerKeys })
    }),
    capabilities: inferCapabilities({ id, type, command, url })
  };
}

function createReadiness({
  type,
  command,
  url,
  disabled,
  riskFlags
}: {
  type: ImportedMcpServer["type"];
  command: string;
  url?: string;
  disabled: boolean;
  riskFlags: string[];
}): ImportedMcpServer["readiness"] {
  if (disabled) {
    return {
      level: "blocked",
      label: "Disabled",
      detail: "This MCP server is marked disabled in the imported config."
    };
  }

  if (type === "stdio" && !command) {
    return {
      level: "blocked",
      label: "Missing command",
      detail: "Stdio MCP servers need a command before AgentDesk can assess them."
    };
  }

  if ((type === "http" || type === "sse") && !url) {
    return {
      level: "blocked",
      label: "Missing URL",
      detail: "Remote MCP servers need a URL before AgentDesk can assess them."
    };
  }

  if (type === "unknown") {
    return {
      level: "blocked",
      label: "Missing transport",
      detail: "MCP servers need either a stdio command or a remote URL before AgentDesk can assess them."
    };
  }

  if (type === "http" || type === "sse") {
    return {
      level: "review",
      label: "Remote review",
      detail: "AgentDesk does not probe remote MCP URLs automatically. Review and approve discovery first."
    };
  }

  if (riskFlags.includes("executes-local-code") || riskFlags.includes("requires-secrets")) {
    return {
      level: "review",
      label: "Needs approval",
      detail: "AgentDesk imported metadata only. Execution or authenticated discovery requires explicit approval."
    };
  }

  return {
    level: "ready",
    label: "Metadata ready",
    detail: "The server metadata is complete enough for graphing and export."
  };
}

function inferCapabilities({
  id,
  type,
  command,
  url
}: {
  id: string;
  type: ImportedMcpServer["type"];
  command: string;
  url?: string;
}): ImportedMcpServer["capabilities"] {
  const descriptor = `${id} ${command} ${url ?? ""}`.toLowerCase();
  const tools = [
    descriptor.includes("browser") ? "browser" : "",
    descriptor.includes("filesystem") || descriptor.includes("file") ? "filesystem" : "",
    descriptor.includes("github") ? "github" : "",
    descriptor.includes("slack") ? "slack" : ""
  ].filter(Boolean);

  return {
    tools,
    resources: descriptor.includes("filesystem") ? ["files"] : [],
    prompts: [],
    discovery:
      type === "http" || type === "sse"
        ? "remote-url"
        : command
          ? "requires-approval"
          : "metadata-only"
  };
}

function inferTransport(
  type: string | undefined,
  command: string,
  url: string | undefined
): ImportedMcpServer["type"] {
  if (type === "stdio" || type === "http" || type === "sse") {
    return type;
  }

  if (url?.toLowerCase().startsWith("http")) {
    return "http";
  }

  if (command) {
    return "stdio";
  }

  return "unknown";
}

function createRiskFlags({
  command,
  args,
  url,
  envKeys,
  headerKeys
}: {
  command: string;
  args: string[];
  url?: string;
  envKeys: string[];
  headerKeys: string[];
}) {
  const flags: string[] = [];
  const normalizedCommand = command.toLowerCase().split(/[\\/]/).pop() ?? command.toLowerCase();
  const serializedArgs = args.join(" ");

  if (
    [
      "npx",
      "npx.cmd",
      "npm",
      "npm.cmd",
      "pnpm",
      "pnpm.cmd",
      "yarn",
      "yarn.cmd",
      "bun",
      "bunx",
      "deno",
      "uvx",
      "uv",
      "pipx",
      "docker",
      "node",
      "node.exe",
      "python",
      "python.exe",
      "python3",
      "bash",
      "sh",
      "cmd",
      "cmd.exe",
      "powershell",
      "powershell.exe",
      "pwsh",
      "pwsh.exe"
    ].includes(normalizedCommand)
  ) {
    flags.push("executes-local-code");
  }

  if (containsSensitiveName(serializedArgs) || looksSecretish(serializedArgs)) {
    flags.push("possible-secret-in-args");
  }

  if (url && (containsSensitiveName(url) || looksSecretish(url))) {
    flags.push("possible-secret-in-url");
  }

  if (envKeys.length > 0 || headerKeys.length > 0) {
    flags.push("requires-secrets");
  }

  return flags;
}

function safeKeys(record: Record<string, string> | undefined) {
  return record ? Object.keys(record).filter((key) => !isDangerousKey(key)) : [];
}

function isDangerousKey(key: string) {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

function isPlainRecord(value: unknown): value is Record<string, McpServerConfig> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function redactUrl(url: string | undefined) {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.pathname = redactPathname(parsed.pathname);
    parsed.search = parsed.search ? "?redacted_query=true" : "";
    parsed.hash = parsed.hash ? "#redacted" : "";
    return parsed.toString();
  } catch {
    return redactPlainText(url);
  }
}

function redactArgs(args: string[]) {
  return args.map((arg, index) => {
    const previous = args[index - 1] ?? "";

    if (containsSensitiveName(previous) && !arg.startsWith("-")) {
      return "[REDACTED]";
    }

    return redactPathValue(redactPlainText(arg)) ?? "";
  });
}

function redactObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return redactArgs(value.map((entry) => String(entry)));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        redactObjectEntry(key, entry)
      ])
    );
  }

  if (typeof value === "string") {
    return redactPathValue(redactPlainText(value)) ?? "";
  }

  return value;
}

function redactObjectEntry(key: string, entry: unknown) {
  if (containsSensitiveName(key)) {
    return "[REDACTED]";
  }

  if (key.toLowerCase() === "url" && typeof entry === "string") {
    return redactUrl(entry);
  }

  if (["cwd", "envfile", "env_file", "path"].includes(key.toLowerCase()) && typeof entry === "string") {
    return redactPathValue(entry);
  }

  return redactObject(entry);
}

function redactPlainText(value: string) {
  return value
    .replace(/(api[-_]?key|apikey|openaiApiKey|anthropicApiKey|access[-_]?token|refresh[-_]?token|client[-_]?secret|private[-_]?key|secret|token|password|x-api-key|xApiKey|databaseUrl|database_url)(=|:)\s*[^,\s"']+/gi, "$1$2[REDACTED]")
    .replace(/\bbearer\s+[A-Za-z0-9._-]{10,}\b/gi, "Bearer [REDACTED]")
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{12,})\b/g, "[REDACTED]")
    .replace(/\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED]");
}

function redactPathname(pathname: string) {
  const segments = pathname.split("/");

  return segments
    .map((segment, index) => {
      const previous = segments[index - 1] ?? "";

      if (looksSecretish(segment) || containsSensitiveName(previous)) {
        return "[REDACTED]";
      }

      return segment;
    })
    .join("/");
}

function containsSensitiveName(value: string) {
  return /api[-_\s]?key|apikey|access[-_\s]?token|refresh[-_\s]?token|auth|authorization|bearer|client[-_\s]?secret|cookie|jwt|password|private[-_\s]?key|secret|session|token|x[-_\s]?api[-_\s]?key|xapikey|database[-_\s]?url|databaseurl/i.test(
    value
  );
}

function looksSecretish(value: string) {
  return /\b(gh[pousr]_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/i.test(
    value
  );
}

function redactPathValue(value: string | undefined) {
  if (!value) {
    return value;
  }

  return value
    .replace(/[A-Z]:\\Users\\[^\\/]+/gi, "${userHome}")
    .replace(/\/Users\/[^/]+/g, "${userHome}")
    .replace(/\/home\/[^/]+/g, "${userHome}")
    .replace(/\.env(?:\.[A-Za-z0-9_-]+)?/g, ".env");
}

export const sampleMcpConfig = JSON.stringify(
  {
    mcpServers: {
      browser: {
        command: "npx",
        args: ["@agentdesk/browser-mcp"],
        env: {
          BROWSER_PROFILE: "agentdesk"
        }
      },
      filesystem: {
        command: "npx",
        args: ["@modelcontextprotocol/server-filesystem", "./workspace"],
        env: {}
      }
    }
  },
  null,
  2
);
