import type {
  AgentFlowNode,
  AgentWorkflow,
  ImportedMcpServer,
  McpToolDescriptor,
  TraceEvent
} from "../types/workflow";

export type LocalRuntimeStatus = {
  available: boolean;
  enabled: boolean;
  version: string;
  capabilities: string[];
  message: string;
};

export type McpDiscoveryResult = {
  serverId: string;
  status: "available" | "failed";
  message: string;
  tools: string[];
  toolDescriptors?: McpToolDescriptor[];
  resources: string[];
  prompts: string[];
  serverInfo?: string;
  protocolVersion?: string;
};

const runtimeHeaders = {
  "Content-Type": "application/json",
  "X-AgentDesk-Runtime": "1"
};

export async function checkLocalRuntime(signal?: AbortSignal): Promise<LocalRuntimeStatus> {
  try {
    const response = await fetch("/api/runtime/status", {
      method: "GET",
      headers: {
        "X-AgentDesk-Runtime": "1"
      },
      signal
    });

    if (!response.ok) {
      throw new Error(`Runtime status returned HTTP ${response.status}`);
    }

    return (await response.json()) as LocalRuntimeStatus;
  } catch (error) {
    return {
      available: false,
      enabled: false,
      version: "unavailable",
      capabilities: [],
      message:
        error instanceof Error
          ? error.message
          : "The local AgentDesk runtime is unavailable. Start the packaged CLI to execute local tools or MCP."
    };
  }
}

export async function runRuntimeNode(
  workflow: AgentWorkflow,
  node: AgentFlowNode,
  index: number,
  runId: string,
  options: {
    mcpConfigText?: string;
    signal?: AbortSignal;
  } = {}
): Promise<TraceEvent> {
  const response = await fetch("/api/runtime/execute-node", {
    method: "POST",
    headers: runtimeHeaders,
    body: JSON.stringify({
      approved: true,
      workflow: summarizeWorkflow(workflow),
      node,
      index,
      runId,
      mcpConfigText: options.mcpConfigText
    }),
    signal: options.signal
  });

  const payload = (await response.json().catch(() => undefined)) as
    | { event?: TraceEvent; error?: string }
    | undefined;

  if (!response.ok || !payload?.event) {
    throw new Error(payload?.error ?? `Runtime execution returned HTTP ${response.status}`);
  }

  return payload.event;
}

export async function discoverMcpServer(
  server: ImportedMcpServer,
  mcpConfigText: string,
  signal?: AbortSignal
): Promise<McpDiscoveryResult> {
  const response = await fetch("/api/runtime/mcp/discover", {
    method: "POST",
    headers: runtimeHeaders,
    body: JSON.stringify({
      approved: true,
      serverId: server.id,
      mcpConfigText
    }),
    signal
  });
  const payload = (await response.json().catch(() => undefined)) as
    | McpDiscoveryResult
    | { error?: string }
    | undefined;

  if (!response.ok) {
    return {
      serverId: server.id,
      status: "failed",
      message: payload && "error" in payload && payload.error ? payload.error : `HTTP ${response.status}`,
      tools: [],
      resources: [],
      prompts: []
    };
  }

  if (!payload || !("status" in payload)) {
    return {
      serverId: server.id,
      status: "failed",
      message:
        "Local runtime discovery returned an invalid response. Start AgentDesk through the packaged CLI for live MCP discovery.",
      tools: [],
      resources: [],
      prompts: []
    };
  }

  return payload as McpDiscoveryResult;
}

export function createRuntimeUnavailableEvent(
  workflow: AgentWorkflow,
  node: AgentFlowNode,
  index: number,
  runId: string,
  message: string
): TraceEvent {
  return {
    id: `${workflow.id}-${node.id}-runtime-unavailable-${Date.now()}`,
    runId,
    nodeId: node.id,
    nodeLabel: node.data.label,
    kind: node.data.kind,
    status: "failed",
    startedAt: new Date().toISOString(),
    durationMs: 0,
    provider: node.data.provider,
    model: node.data.model,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    summary: message,
    artifacts: [
      {
        id: `${workflow.id}-${node.id}-runtime-stderr`,
        name: `${node.data.label} runtime error`,
        type: "stderr",
        uri: `artifact://runtime/${node.id}/stderr.log`,
        content: message
      }
    ],
    debug: {
      prompt: node.data.promptTemplate ?? node.data.description,
      toolCall: JSON.stringify(
        {
          provider: node.data.provider ?? "none",
          kind: node.data.kind,
          runtime: "local"
        },
        null,
        2
      ),
      result: message,
      stderr: message
    },
    error: {
      code: "LOCAL_RUNTIME_UNAVAILABLE",
      message
    },
    inputRef: `input://${workflow.id}/${node.id}`,
    outputRef: undefined,
    inputPreview: `Runtime mode attempted ${node.data.label}.`,
    outputPreview: undefined
  };
}

function summarizeWorkflow(workflow: AgentWorkflow) {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description
  };
}
