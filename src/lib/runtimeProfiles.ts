import type { AgentWorkflow, ImportedMcpServer } from "../types/workflow";

export const runtimeProfileStorageKey = "agentdesk.runtimeProfiles.v1";

export type RuntimeCommandProfile = {
  id: string;
  label: string;
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  envKeys: string[];
  approved: boolean;
  blocked: boolean;
};

export type RuntimeMcpProfile = {
  serverId: string;
  type: ImportedMcpServer["type"];
  command: string;
  args: string[];
  cwd?: string;
  url?: string;
  envKeys: string[];
  headerKeys: string[];
  riskFlags: string[];
  approved: boolean;
  blocked: boolean;
};

export type RuntimeProfileDocument = {
  schema: "agentdesk.runtime-profiles.v1";
  createdAt: string;
  localCommands: RuntimeCommandProfile[];
  mcpServers: RuntimeMcpProfile[];
};

export function createRuntimeProfileDocument(
  workflow: AgentWorkflow,
  importedServers: ImportedMcpServer[],
  now = new Date()
): RuntimeProfileDocument {
  return {
    schema: "agentdesk.runtime-profiles.v1",
    createdAt: now.toISOString(),
    localCommands: workflow.nodes
      .filter((node) => node.data.provider === "local")
      .map((node) => {
        const command = stringConfig(node.data.config?.command);

        return {
          id: node.id,
          label: node.data.label,
          command,
          args: parseArgsConfig(node.data.config),
          cwd: stringConfig(node.data.config?.cwd) || undefined,
          timeoutMs: numberConfig(node.data.config?.timeoutMs ?? node.data.timeoutMs),
          envKeys: parseKeyList(node.data.config?.envKeys),
          approved: Boolean(command),
          blocked: !command
        };
      }),
    mcpServers: importedServers.map((server) => ({
      serverId: server.id,
      type: server.type,
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      url: server.url,
      envKeys: server.envKeys,
      headerKeys: server.headerKeys,
      riskFlags: server.riskFlags,
      approved: server.readiness.level !== "blocked",
      blocked: server.readiness.level === "blocked"
    }))
  };
}

export function summarizeRuntimeProfiles(document: RuntimeProfileDocument | null | undefined) {
  const commands = document?.localCommands ?? [];
  const servers = document?.mcpServers ?? [];
  const profiles = [...commands, ...servers];

  return {
    total: profiles.length,
    approved: profiles.filter((profile) => profile.approved && !profile.blocked).length,
    blocked: profiles.filter((profile) => profile.blocked).length
  };
}

export function saveRuntimeProfiles(
  document: RuntimeProfileDocument,
  storage: Pick<Storage, "setItem"> = window.localStorage
) {
  storage.setItem(runtimeProfileStorageKey, JSON.stringify(document, null, 2));
}

export function loadRuntimeProfiles(
  storage: Pick<Storage, "getItem"> = window.localStorage
): RuntimeProfileDocument | null {
  const raw = storage.getItem(runtimeProfileStorageKey);

  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw) as RuntimeProfileDocument;

  if (parsed.schema !== "agentdesk.runtime-profiles.v1") {
    throw new Error("Stored runtime profile document has an unsupported schema.");
  }

  return parsed;
}

function parseArgsConfig(config: unknown) {
  if (!config || typeof config !== "object") {
    return [];
  }

  const argsJson = "argsJson" in config ? stringConfig(config.argsJson) : "";

  if (argsJson) {
    try {
      const parsed = JSON.parse(argsJson);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  const args = "args" in config ? stringConfig(config.args) : "";
  return args ? args.split(/\s+/).filter(Boolean) : [];
}

function parseKeyList(value: unknown) {
  return stringConfig(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function stringConfig(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberConfig(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
