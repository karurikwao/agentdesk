import type { AgentWorkflow, TraceEvent } from "../types/workflow";

const durationByKind = {
  trigger: 140,
  model: 920,
  prompt: 180,
  tool: 610,
  memory: 240,
  router: 320,
  output: 470
};

export function createTraceEvent(
  workflow: AgentWorkflow,
  nodeId: string,
  index: number,
  runId = `run-${Date.now()}`
): TraceEvent {
  const node = workflow.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    throw new Error(`Unknown node: ${nodeId}`);
  }

  const durationMs = durationByKind[node.data.kind] + index * 53;
  const tokensIn = node.data.kind === "model" ? 720 + index * 90 : 80 + index * 12;
  const tokensOut = node.data.kind === "model" ? 330 + index * 32 : 24 + index * 5;
  const demoFailure = Boolean(node.data.config?.demoFailure);
  const costUsd =
    !node.data.provider || node.data.provider === "ollama" || node.data.provider === "local"
      ? 0
      : Number(((tokensIn + tokensOut) * 0.000004).toFixed(4));

  return {
    id: `${workflow.id}-${nodeId}-${Date.now()}`,
    runId,
    nodeId,
    nodeLabel: node.data.label,
    kind: node.data.kind,
    status: demoFailure ? "failed" : "complete",
    startedAt: new Date(Date.now() + index * 1000).toISOString(),
    durationMs,
    provider: node.data.provider,
    tokensIn,
    tokensOut,
    costUsd,
    summary: demoFailure
      ? `${node.data.label} failed with a simulated tool timeout for replay debugging.`
      : createSummary(node.data.label, node.data.kind),
    artifact: createArtifact(node.data.label, node.data.kind),
    inputRef: `input://${workflow.id}/${nodeId}`,
    outputRef: demoFailure ? undefined : `output://${workflow.id}/${nodeId}`,
    inputPreview: createInputPreview(workflow.name, node.data.label),
    outputPreview: demoFailure ? undefined : createOutputPreview(node.data.label, node.data.kind),
    error: demoFailure
      ? {
          code: "DEMO_TOOL_TIMEOUT",
          message:
            "This demo failure shows how AgentDesk keeps the graph, trace, cost, and artifacts inspectable after a failed step."
        }
      : undefined
  };
}

export function getRunOrder(workflow: AgentWorkflow): string[] {
  const issues = validateWorkflow(workflow);

  if (issues.length > 0) {
    throw new Error(`Invalid workflow graph: ${issues.join("; ")}`);
  }

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  workflow.nodes.forEach((node) => {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  });

  workflow.edges.forEach((edge) => {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  });

  const queue = workflow.nodes
    .filter((node) => (incoming.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const order: string[] = [];

  while (queue.length > 0) {
    const next = queue.shift();

    if (!next) {
      continue;
    }

    order.push(next);
    for (const target of outgoing.get(next) ?? []) {
      incoming.set(target, (incoming.get(target) ?? 1) - 1);
      if ((incoming.get(target) ?? 0) === 0) {
        queue.push(target);
      }
    }
  }

  if (order.length !== workflow.nodes.length) {
    throw new Error("Invalid workflow graph: cycle detected");
  }

  return order;
}

export function validateWorkflow(workflow: AgentWorkflow): string[] {
  const issues: string[] = [];
  const nodeIds = new Set<string>();

  for (const node of workflow.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push(`duplicate node id "${node.id}"`);
    }

    nodeIds.add(node.id);
  }

  for (const edge of workflow.edges) {
    if (!nodeIds.has(edge.source)) {
      issues.push(`edge "${edge.id}" has missing source "${edge.source}"`);
    }

    if (!nodeIds.has(edge.target)) {
      issues.push(`edge "${edge.id}" has missing target "${edge.target}"`);
    }

    if (edge.source === edge.target) {
      issues.push(`edge "${edge.id}" is a self-loop`);
    }
  }

  return issues;
}

function createSummary(label: string, kind: TraceEvent["kind"]) {
  switch (kind) {
    case "model":
      return `${label} simulated a structured plan and selected the next tool calls.`;
    case "tool":
      return `${label} simulated a local tool response and returned normalized output.`;
    case "router":
      return `${label} simulated the lowest-risk route based on provider, cost, and confidence.`;
    case "memory":
      return `${label} simulated trace evidence for replay and final review.`;
    case "output":
      return `${label} simulated a shareable artifact from the completed run.`;
    case "prompt":
      return `${label} normalized the task into success criteria and constraints.`;
    default:
      return `${label} started the workflow.`;
  }
}

function createArtifact(label: string, kind: TraceEvent["kind"]) {
  if (kind === "output") {
    return `artifact://${label.toLowerCase().replaceAll(" ", "-")}/report.md`;
  }

  if (kind === "tool") {
    return `trace://${label.toLowerCase().replaceAll(" ", "-")}/stdout.json`;
  }

  return undefined;
}

function createInputPreview(workflowName: string, label: string) {
  return `Workflow ${workflowName} entered ${label} with the previous step output and run context.`;
}

function createOutputPreview(label: string, kind: TraceEvent["kind"]) {
  if (kind === "model") {
    return `${label} simulated a structured plan with selected next actions.`;
  }

  if (kind === "tool") {
    return `${label} simulated normalized tool output and artifact metadata.`;
  }

  return `${label} completed as a simulated trace step.`;
}
