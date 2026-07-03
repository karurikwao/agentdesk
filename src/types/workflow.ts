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

export type RunMode = "demo" | "ollama";

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
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  summary: string;
  artifact?: string;
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
    discovery: "metadata-only" | "requires-approval" | "remote-url";
  };
};
