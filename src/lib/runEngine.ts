import type {
  AgentFlowNode,
  AgentWorkflow,
  CostBreakdownItem,
  GraphValidationIssue,
  TraceArtifact,
  TraceEvent
} from "../types/workflow";

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
  runId = `run-${Date.now()}`,
  options: { replayOf?: TraceEvent; replayAttempt?: number } = {}
): TraceEvent {
  const node = workflow.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    throw new Error(`Unknown node: ${nodeId}`);
  }

  const durationMs = durationByKind[node.data.kind] + index * 53;
  const tokensIn = node.data.kind === "model" ? 720 + index * 90 : 80 + index * 12;
  const tokensOut = node.data.kind === "model" ? 330 + index * 32 : 24 + index * 5;
  const demoFailure = Boolean(node.data.config?.demoFailure);
  const isReplay = Boolean(options.replayOf);
  const status = demoFailure && !isReplay ? "failed" : "complete";
  const model = node.data.model ?? defaultModelForNode(node);
  const costUsd =
    !node.data.provider || node.data.provider === "ollama" || node.data.provider === "local"
      ? 0
      : Number(((tokensIn + tokensOut) * 0.000004).toFixed(4));
  const generatedDebug = createDebugPayload(workflow, node, index, status, isReplay);
  const debug =
    isReplay && options.replayOf?.debug
      ? {
          ...options.replayOf.debug,
          result: `${options.replayOf.debug.result}\n\nReplay result: ${generatedDebug.result}`,
          stdout: [options.replayOf.debug.stdout, generatedDebug.stdout].filter(Boolean).join("\n--- replay ---\n"),
          stderr: options.replayOf.debug.stderr
        }
      : generatedDebug;
  const generatedArtifacts = createArtifacts(workflow, node, status, debug, isReplay).map((artifact) =>
    isReplay
      ? {
          ...artifact,
          id: `${artifact.id}-replay-${options.replayAttempt ?? 1}-result`,
          name: `Replay result: ${artifact.name}`
        }
      : artifact
  );
  const artifacts =
    isReplay && options.replayOf?.artifacts?.length
      ? [
          ...options.replayOf.artifacts.map((artifact) => ({
            ...artifact,
            id: `${artifact.id}-replay-${options.replayAttempt ?? 1}`,
            name: `Replay context: ${artifact.name}`
          })),
          ...generatedArtifacts
        ]
      : generatedArtifacts;

  return {
    id: `${workflow.id}-${nodeId}-${isReplay ? "replay" : "event"}-${Date.now()}`,
    runId,
    nodeId,
    nodeLabel: node.data.label,
    kind: node.data.kind,
    status,
    startedAt: new Date(Date.now() + index * 1000).toISOString(),
    durationMs,
    provider: node.data.provider,
    model,
    tokensIn,
    tokensOut,
    costUsd,
    summary: isReplay
      ? `${node.data.label} replayed with preserved prompt, tool call, and artifact context.`
      : demoFailure
      ? `${node.data.label} failed with a simulated tool timeout for replay debugging.`
      : createSummary(node.data.label, node.data.kind),
    artifact: artifacts[0]?.uri ?? createArtifact(node.data.label, node.data.kind),
    artifacts,
    debug,
    replayOf: options.replayOf?.id,
    replayAttempt: options.replayAttempt,
    inputRef: `input://${workflow.id}/${nodeId}`,
    outputRef: status === "failed" ? undefined : `output://${workflow.id}/${nodeId}`,
    inputPreview: createInputPreview(workflow.name, node.data.label),
    outputPreview: status === "failed" ? undefined : createOutputPreview(node.data.label, node.data.kind),
    error: status === "failed"
      ? {
          code: "DEMO_TOOL_TIMEOUT",
          message:
            "This demo failure shows how AgentDesk keeps the graph, trace, cost, and artifacts inspectable after a failed step."
        }
      : undefined
  };
}

export function getRunOrder(workflow: AgentWorkflow): string[] {
  const validation = validateWorkflowGraph(workflow);
  const errors = validation.filter((issue) => issue.severity === "error");

  if (errors.length > 0) {
    throw new Error(`Invalid workflow graph: ${errors.map((issue) => issue.message).join("; ")}`);
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
  return validateWorkflowGraph(workflow)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
}

export function validateWorkflowGraph(workflow: AgentWorkflow): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const edgeIds = new Set<string>();

  if (workflow.nodes.length === 0) {
    issues.push({
      id: "empty-workflow",
      severity: "error",
      code: "missing-output",
      message: "workflow has no nodes"
    });
  }

  for (const node of workflow.nodes) {
    if (nodeIds.has(node.id)) {
      duplicateIds.add(node.id);
      issues.push({
        id: `duplicate-node-${node.id}`,
        severity: "error",
        code: "duplicate-node",
        nodeId: node.id,
        message: `duplicate node id "${node.id}"`
      });
    }

    nodeIds.add(node.id);
  }

  for (const edge of workflow.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push({
        id: `duplicate-edge-${edge.id}`,
        severity: "error",
        code: "duplicate-edge",
        edgeId: edge.id,
        message: `duplicate edge id "${edge.id}"`
      });
    }

    edgeIds.add(edge.id);

    if (!edge.source || !nodeIds.has(edge.source)) {
      issues.push({
        id: `missing-source-${edge.id}`,
        severity: "error",
        code: "missing-source",
        edgeId: edge.id,
        message: `edge "${edge.id}" has missing source "${edge.source}"`
      });
    }

    if (!edge.target || !nodeIds.has(edge.target)) {
      issues.push({
        id: `missing-target-${edge.id}`,
        severity: "error",
        code: "missing-target",
        edgeId: edge.id,
        message: `edge "${edge.id}" has missing target "${edge.target}"`
      });
    }

    if (edge.source === edge.target) {
      issues.push({
        id: `self-loop-${edge.id}`,
        severity: "error",
        code: "self-loop",
        edgeId: edge.id,
        nodeId: edge.source,
        message: `edge "${edge.id}" is a self-loop`
      });
    }
  }

  if (workflow.nodes.length > 0 && !workflow.nodes.some((node) => node.data.kind === "output")) {
    issues.push({
      id: "missing-output",
      severity: "warning",
      code: "missing-output",
      message: "workflow has no output node"
    });
  }

  const structurallyValid = issues.every((issue) => issue.severity !== "error") && duplicateIds.size === 0;

  if (structurallyValid) {
    issues.push(...findConnectivityIssues(workflow));
    const cycleScope = findCycleScope(workflow);
    if (cycleScope) {
      issues.push({
        id: "cycle-detected",
        severity: "error",
        code: "cycle",
        nodeId: cycleScope.nodeIds[0],
        nodeIds: cycleScope.nodeIds,
        edgeIds: cycleScope.edgeIds,
        message: "cycle detected"
      });
    }
  }

  return issues;
}

export function createCostBreakdown(events: TraceEvent[]): CostBreakdownItem[] {
  const groups = new Map<string, CostBreakdownItem>();

  for (const event of events) {
    const provider = event.provider ?? "none";
    const model = event.model ?? "n/a";
    const id = `${provider}:${model}`;
    const current =
      groups.get(id) ??
      {
        id,
        provider,
        model,
        events: 0,
        tokensIn: 0,
        tokensOut: 0,
        totalTokens: 0,
        costUsd: 0
      };

    current.events += 1;
    current.tokensIn += event.tokensIn;
    current.tokensOut += event.tokensOut;
    current.totalTokens += event.tokensIn + event.tokensOut;
    current.costUsd = Number((current.costUsd + event.costUsd).toFixed(4));
    groups.set(id, current);
  }

  return [...groups.values()].sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens);
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

function defaultModelForNode(node: AgentFlowNode) {
  if (node.data.model) {
    return node.data.model;
  }

  switch (node.data.provider) {
    case "openai":
      return "simulated-gpt";
    case "anthropic":
      return "simulated-claude";
    case "ollama":
      return "llama3.2";
    case "mcp":
      return "mcp-metadata";
    case "local":
      return "local-sim";
    default:
      return undefined;
  }
}

function createDebugPayload(
  workflow: AgentWorkflow,
  node: AgentFlowNode,
  index: number,
  status: TraceEvent["status"],
  isReplay: boolean
) {
  const prompt = [
    `Workflow: ${workflow.name}`,
    `Step ${index + 1}: ${node.data.label}`,
    `Goal: ${workflow.description}`,
    `Instruction: ${node.data.promptTemplate ?? node.data.description}`
  ].join("\n");
  const toolCall = JSON.stringify(
    {
      provider: node.data.provider ?? "none",
      model: defaultModelForNode(node),
      kind: node.data.kind,
      action: node.data.kind === "tool" ? "metadata-only tool simulation" : "simulated step",
      config: redactDebugConfig(node.data.config ?? {})
    },
    null,
    2
  );
  const result =
    status === "failed"
      ? `${node.data.label} timed out in the simulated replay harness.`
      : `${node.data.label} returned a simulated debugger payload${isReplay ? " during replay" : ""}.`;

  return {
    prompt,
    toolCall,
    result,
    stdout: `${node.data.label}: start\n${node.data.label}: normalized context\n${node.data.label}: ${status}`,
    stderr: status === "failed" ? "DEMO_TOOL_TIMEOUT: simulated browser MCP timeout" : undefined
  };
}

function redactDebugConfig(config: Record<string, string | number | boolean>) {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      isSensitiveConfigKey(key) ? "[REDACTED]" : typeof value === "string" ? redactDebugString(value) : value
    ])
  );
}

function isSensitiveConfigKey(key: string) {
  return /api[-_\s]?key|apikey|access[-_\s]?token|refresh[-_\s]?token|authorization|bearer|client[-_\s]?secret|cookie|jwt|password|private[-_\s]?key|secret|session|token|x[-_\s]?api[-_\s]?key|database[-_\s]?url|databaseurl/i.test(key);
}

function redactDebugString(value: string) {
  return value
    .replace(/(api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|client[-_]?secret|private[-_]?key|secret|token|password|x-api-key|xApiKey|databaseUrl|database_url)(=|:)\s*[^,\s"']+/gi, "$1$2[REDACTED]")
    .replace(/\bbearer\s+[A-Za-z0-9._-]{10,}\b/gi, "Bearer [REDACTED]")
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED]");
}

function createArtifacts(
  workflow: AgentWorkflow,
  node: AgentFlowNode,
  status: TraceEvent["status"],
  debug: ReturnType<typeof createDebugPayload>,
  isReplay: boolean
): TraceArtifact[] {
  const slug = `${workflow.id}-${node.id}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const artifacts: TraceArtifact[] = [
    {
      id: `${slug}-json`,
      name: `${node.data.label} payload`,
      type: "json",
      uri: `artifact://${slug}/payload.json`,
      content: JSON.stringify(
        {
          nodeId: node.id,
          label: node.data.label,
          provider: node.data.provider ?? "none",
          model: defaultModelForNode(node),
          status,
          replay: isReplay,
          result: debug.result
        },
        null,
        2
      )
    },
    {
      id: `${slug}-markdown`,
      name: `${node.data.label} notes`,
      type: "markdown",
      uri: `artifact://${slug}/notes.md`,
      content: [`# ${node.data.label}`, "", debug.result, "", `Provider: ${node.data.provider ?? "none"}`].join("\n")
    }
  ];

  if (node.data.kind === "tool" || status === "failed") {
    artifacts.push({
      id: `${slug}-stdout`,
      name: `${node.data.label} stdout`,
      type: "stdout",
      uri: `artifact://${slug}/stdout.log`,
      content: debug.stdout ?? ""
    });
  }

  if (status === "failed" && debug.stderr) {
    artifacts.push(
      {
        id: `${slug}-stderr`,
        name: `${node.data.label} stderr`,
        type: "stderr",
        uri: `artifact://${slug}/stderr.log`,
        content: debug.stderr
      },
      {
        id: `${slug}-screenshot`,
        name: `${node.data.label} screenshot`,
        type: "screenshot",
        uri: `artifact://${slug}/screenshot.svg`,
        content: createScreenshotArtifact(node.data.label)
      }
    );
  }

  return artifacts;
}

function createScreenshotArtifact(label: string) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img">',
    `<title>${escapeXml(label)} replay screenshot</title>`,
    '<rect width="640" height="360" fill="#eff6ff"/>',
    '<rect x="36" y="42" width="568" height="276" rx="8" fill="#ffffff" stroke="#bfdbfe"/>',
    '<rect x="72" y="92" width="210" height="44" rx="6" fill="#dbeafe"/>',
    '<rect x="72" y="158" width="360" height="22" rx="4" fill="#e0f2fe"/>',
    '<rect x="72" y="198" width="300" height="22" rx="4" fill="#fee2e2"/>',
    '<circle cx="520" cy="118" r="34" fill="#e11d48" opacity="0.12"/>',
    '<path d="M506 118h28" stroke="#e11d48" stroke-width="8" stroke-linecap="round"/>',
    `<text x="72" y="258" fill="#0f172a" font-family="Arial" font-size="22" font-weight="700">${escapeXml(label)}</text>`,
    '<text x="72" y="288" fill="#64748b" font-family="Arial" font-size="16">Simulated failure screenshot artifact</text>',
    "</svg>"
  ].join("");
}

function findConnectivityIssues(workflow: AgentWorkflow): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();

  workflow.nodes.forEach((node) => {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
    reverse.set(node.id, []);
  });

  workflow.edges.forEach((edge) => {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    reverse.set(edge.target, [...(reverse.get(edge.target) ?? []), edge.source]);
  });

  const triggers = workflow.nodes.filter((node) => node.data.kind === "trigger");
  const starts = triggers.length > 0 ? triggers : workflow.nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
  const reachable = new Set<string>();
  const queue = starts.map((node) => node.id);
  const reachesOutput = new Set<string>();
  const outputQueue = workflow.nodes
    .filter((node) => node.data.kind === "output")
    .map((node) => node.id);

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || reachable.has(next)) {
      continue;
    }
    reachable.add(next);
    queue.push(...(outgoing.get(next) ?? []));
  }

  while (outputQueue.length > 0) {
    const next = outputQueue.shift();
    if (!next || reachesOutput.has(next)) {
      continue;
    }
    reachesOutput.add(next);
    outputQueue.push(...(reverse.get(next) ?? []));
  }

  for (const node of workflow.nodes) {
    const incomingCount = incoming.get(node.id) ?? 0;
    const outgoingCount = outgoing.get(node.id)?.length ?? 0;

    if (triggers.length > 0 && node.data.kind !== "trigger" && incomingCount === 0) {
      issues.push({
        id: `missing-incoming-${node.id}`,
        severity: "warning",
        code: "missing-incoming",
        nodeId: node.id,
        message: `${node.data.label} has no incoming edge`
      });
    }

    if (node.data.kind !== "output" && outgoingCount === 0) {
      issues.push({
        id: `missing-outgoing-${node.id}`,
        severity: "warning",
        code: "missing-outgoing",
        nodeId: node.id,
        message: `${node.data.label} has no outgoing edge`
      });
    }

    if (!reachable.has(node.id)) {
      issues.push({
        id: `unreachable-node-${node.id}`,
        severity: "warning",
        code: node.data.kind === "output" ? "unreachable-output" : "unreachable-node",
        nodeId: node.id,
        message:
          node.data.kind === "output"
            ? `${node.data.label} output is unreachable from the trigger path`
            : `${node.data.label} is unreachable from the trigger path`
      });
    }

    if (workflow.nodes.some((candidate) => candidate.data.kind === "output") && !reachesOutput.has(node.id)) {
      issues.push({
        id: `cannot-reach-output-${node.id}`,
        severity: "warning",
        code: "cannot-reach-output",
        nodeId: node.id,
        message: `${node.data.label} cannot reach an output node`
      });
    }
  }

  return issues;
}

function findCycleScope(workflow: AgentWorkflow) {
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
  let visited = 0;

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }

    visited += 1;
    for (const target of outgoing.get(next) ?? []) {
      incoming.set(target, (incoming.get(target) ?? 1) - 1);
      if ((incoming.get(target) ?? 0) === 0) {
        queue.push(target);
      }
    }
  }

  if (visited === workflow.nodes.length) {
    return undefined;
  }

  const cycleNodeIds = workflow.nodes
    .filter((node) => (incoming.get(node.id) ?? 0) > 0)
    .map((node) => node.id);
  const cycleNodeSet = new Set(cycleNodeIds);
  const cycleEdgeIds = workflow.edges
    .filter((edge) => cycleNodeSet.has(edge.source) && cycleNodeSet.has(edge.target))
    .map((edge) => edge.id);

  return {
    nodeIds: cycleNodeIds,
    edgeIds: cycleEdgeIds
  };
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
