import type { Edge, Node } from "@xyflow/react";

export type AgentNodeKind =
  | "trigger"
  | "model"
  | "prompt"
  | "tool"
  | "memory"
  | "router"
  | "output";

export type ProviderKind = "ollama" | "openai" | "anthropic" | "local" | "mcp";

export type RunStatus = "idle" | "running" | "paused" | "complete" | "failed";

export type RunMode = "demo" | "ollama" | "cloud" | "runtime";

export type TraceArtifactType = "json" | "markdown" | "screenshot" | "stdout" | "stderr";

export type TraceArtifact = {
  id: string;
  name: string;
  type: TraceArtifactType;
  uri: string;
  content: string;
};

export type TraceDebugPayload = {
  prompt: string;
  toolCall: string;
  result: string;
  stdout?: string;
  stderr?: string;
};

export type CostBreakdownItem = {
  id: string;
  provider: ProviderKind | "none";
  model: string;
  events: number;
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  costUsd: number;
};

export type GraphValidationIssue = {
  id: string;
  severity: "error" | "warning";
  code:
    | "cycle"
    | "duplicate-node"
    | "duplicate-edge"
    | "missing-start"
    | "missing-source"
    | "missing-target"
    | "self-loop"
    | "missing-incoming"
    | "missing-outgoing"
    | "unreachable-node"
    | "unreachable-output"
    | "cannot-reach-output"
    | "missing-output";
  message: string;
  nodeId?: string;
  nodeIds?: string[];
  edgeId?: string;
  edgeIds?: string[];
};

export type AgentNodeData = {
  label: string;
  kind: AgentNodeKind;
  description: string;
  provider?: ProviderKind;
  model?: string;
  promptTemplate?: string;
  timeoutMs?: number;
  retryPolicy?: "none" | "linear" | "exponential";
  safetyPolicy?: "demo" | "approval-required" | "sandboxed";
  config?: Record<string, string | number | boolean>;
  [key: string]: unknown;
};

export type AgentFlowNode = Node<AgentNodeData, "agentNode">;

export type AgentFlowEdge = Edge<{
  label?: string;
  condition?: string;
  route?: "success" | "error" | "fallback";
}>;

export type AgentWorkflow = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  nodes: AgentFlowNode[];
  edges: AgentFlowEdge[];
};

export type TraceEvent = {
  id: string;
  runId: string;
  nodeId: string;
  nodeLabel: string;
  kind: AgentNodeKind;
  status: "queued" | "running" | "complete" | "failed";
  startedAt: string;
  durationMs: number;
  provider?: ProviderKind;
  model?: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  summary: string;
  artifact?: string;
  artifacts?: TraceArtifact[];
  debug?: TraceDebugPayload;
  replayOf?: string;
  replayAttempt?: number;
  inputRef?: string;
  outputRef?: string;
  inputPreview?: string;
  outputPreview?: string;
  error?: {
    code: string;
    message: string;
  };
};

export type McpReadinessLevel = "ready" | "review" | "blocked";

export type McpReadiness = {
  level: McpReadinessLevel;
  label: string;
  detail: string;
};

export type ImportedMcpServer = {
  id: string;
  type: "stdio" | "http" | "sse" | "unknown";
  command: string;
  args: string[];
  url?: string;
  cwd?: string;
  envKeys: string[];
  headerKeys: string[];
  envFile?: string;
  disabled?: boolean;
  riskFlags: string[];
  readiness: McpReadiness;
  capabilities: {
    tools: string[];
    resources: string[];
    prompts: string[];
    discovery: "metadata-only" | "requires-approval" | "remote-url" | "live-discovered";
  };
  runtime?: {
    lastCheckedAt?: string;
    status?: "available" | "failed";
    message?: string;
    serverInfo?: string;
  };
};
