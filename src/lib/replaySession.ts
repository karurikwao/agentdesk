import type {
  AgentNodeKind,
  AgentWorkflow,
  CostBreakdownItem,
  GraphValidationIssue,
  ImportedMcpServer,
  ProviderKind,
  RunMode,
  RunStatus,
  TraceArtifact,
  TraceArtifactType,
  TraceEvent
} from "../types/workflow";
import { createWorkflowExport, sanitizeExportPayload } from "./export";
import { createTraceSummary } from "./schema";
import { validateWorkflowGraph } from "./runEngine";

export const REPLAY_SESSION_SCHEMA = "agentdesk.replay-session.v1";

type WorkflowExportPayload = ReturnType<typeof createWorkflowExport>;
type PortableWorkflow = WorkflowExportPayload["portableWorkflow"];
type TraceSummary = WorkflowExportPayload["traceSummary"];
type JsonObject = Record<string, unknown>;

export type ReplaySessionArtifact = TraceArtifact & {
  eventId: string;
  runId: string;
  nodeId: string;
  nodeLabel: string;
  replayOf?: string;
  replayAttempt?: number;
};

export type ReplaySessionCosts = {
  totalCostUsd: number;
  totalTokens: number;
  byProviderModel: CostBreakdownItem[];
};

export type ReplaySessionReplayAttempt = {
  id: string;
  sourceEventId: string;
  replayEventId: string;
  runId: string;
  nodeId: string;
  nodeLabel: string;
  attempt: number;
  status: TraceEvent["status"];
  startedAt: string;
  durationMs: number;
  costUsd: number;
  artifactIds: string[];
};

export type ReplaySessionExport = {
  schema: typeof REPLAY_SESSION_SCHEMA;
  appVersion: string;
  exportedAt: string;
  workflow: AgentWorkflow;
  portableWorkflow: PortableWorkflow;
  trace: TraceEvent[];
  traceSummary: TraceSummary;
  artifacts: ReplaySessionArtifact[];
  costs: ReplaySessionCosts;
  validationIssues: GraphValidationIssue[];
  replayAttempts: ReplaySessionReplayAttempt[];
  session?: ReplaySessionState;
  importedServers?: ImportedMcpServer[];
};

export type ReplaySessionState = {
  status: RunStatus;
  runMode: RunMode;
  selectedTraceEventId?: string;
  selectedArtifactId?: string;
  inspectedNodeId?: string;
  activeInspectorTab?: string;
};

export type ImportedReplaySession = {
  workflow: AgentWorkflow;
  trace: TraceEvent[];
  session: ReplaySessionState;
  importedServers: ImportedMcpServer[];
};

export type ReplaySessionParseResult =
  | { ok: true; session: ReplaySessionExport }
  | { ok: false; errors: string[] };

const agentNodeKinds = ["trigger", "model", "prompt", "tool", "memory", "router", "output"] as const;
const providerKinds = ["ollama", "openai", "anthropic", "local", "mcp"] as const;
const traceArtifactTypes = ["json", "markdown", "screenshot", "stdout", "stderr"] as const;
const traceStatuses = ["queued", "running", "complete", "failed"] as const;
const issueSeverities = ["error", "warning"] as const;
const issueCodes = [
  "cycle",
  "duplicate-node",
  "duplicate-edge",
  "missing-start",
  "missing-source",
  "missing-target",
  "self-loop",
  "missing-incoming",
  "missing-outgoing",
  "unreachable-node",
  "unreachable-output",
  "cannot-reach-output",
  "missing-output"
] as const;
const edgeRoutes = ["success", "error", "fallback"] as const;
const retryPolicies = ["none", "linear", "exponential"] as const;
const safetyPolicies = ["demo", "approval-required", "sandboxed"] as const;

export function createReplaySessionExport(
  workflowOrOptions:
    | AgentWorkflow
    | {
        workflow: AgentWorkflow;
        trace: TraceEvent[];
        graphIssues?: GraphValidationIssue[];
        importedServers?: ImportedMcpServer[];
        session?: ReplaySessionState;
      },
  traceInput: TraceEvent[] = []
): ReplaySessionExport {
  const workflow = "workflow" in workflowOrOptions ? workflowOrOptions.workflow : workflowOrOptions;
  const trace = "workflow" in workflowOrOptions ? workflowOrOptions.trace : traceInput;
  const validationIssues =
    "workflow" in workflowOrOptions && workflowOrOptions.graphIssues
      ? workflowOrOptions.graphIssues
      : validateWorkflowGraph(workflow);
  const workflowExport = createWorkflowExport(workflow, trace);
  const sanitizedWorkflow = hardenReplaySessionSanitization(workflowExport.workflow);
  const sanitizedTrace = restoreTraceMetrics(hardenReplaySessionSanitization(workflowExport.trace), trace);
  const traceSummary = createTraceSummary(sanitizedTrace);

  return {
    schema: REPLAY_SESSION_SCHEMA,
    appVersion: workflowExport.appVersion,
    exportedAt: workflowExport.exportedAt,
    workflow: sanitizedWorkflow,
    portableWorkflow: hardenReplaySessionSanitization(workflowExport.portableWorkflow),
    trace: sanitizedTrace,
    traceSummary,
    artifacts: collectReplaySessionArtifacts(sanitizedTrace),
    costs: {
      totalCostUsd: traceSummary.totalCostUsd,
      totalTokens: traceSummary.totalTokens,
      byProviderModel: traceSummary.costByProviderModel
    },
    validationIssues: hardenReplaySessionSanitization(sanitizeExportPayload(validationIssues)),
    replayAttempts: collectReplayAttempts(sanitizedTrace),
    session:
      "workflow" in workflowOrOptions && workflowOrOptions.session
        ? hardenReplaySessionSanitization(sanitizeExportPayload(workflowOrOptions.session))
        : undefined,
    importedServers:
      "workflow" in workflowOrOptions
        ? hardenReplaySessionSanitization(sanitizeExportPayload(workflowOrOptions.importedServers ?? []))
        : []
  };
}

export function serializeReplaySessionExport(workflow: AgentWorkflow, trace: TraceEvent[]) {
  return JSON.stringify(createReplaySessionExport(workflow, trace), null, 2);
}

export function parseReplaySession(input: string | unknown): ReplaySessionParseResult {
  const parsed = parseReplaySessionInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const errors = validateReplaySessionExport(parsed.value);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const candidate = parsed.value as ReplaySessionExport;
  return {
    ok: true,
    session: {
      ...createReplaySessionExport({
        workflow: candidate.workflow,
        trace: candidate.trace,
        graphIssues: candidate.validationIssues,
        session: candidate.session,
        importedServers: candidate.importedServers
      }),
      appVersion: candidate.appVersion,
      exportedAt: candidate.exportedAt
    }
  };
}

export function importReplaySession(input: string | unknown): ReplaySessionExport {
  const result = parseReplaySession(input);

  if (!result.ok) {
    throw new Error(`Invalid AgentDesk replay session: ${result.errors.join("; ")}`);
  }

  return result.session;
}

export function parseReplaySessionImport(input: string | unknown): ImportedReplaySession {
  const session = importReplaySession(input);
  const selectedTraceEventId = session.session?.selectedTraceEventId;
  const selectedEvent =
    session.trace.find((event) => event.id === selectedTraceEventId) ??
    session.trace[session.trace.length - 1];

  return {
    workflow: session.workflow,
    trace: session.trace,
    importedServers: session.importedServers ?? [],
    session: {
      status: normalizeRunStatus(session.session?.status, session.trace),
      runMode: session.session?.runMode === "ollama" ? "ollama" : "demo",
      selectedTraceEventId: selectedEvent?.id,
      selectedArtifactId: session.session?.selectedArtifactId ?? selectedEvent?.artifacts?.[0]?.id,
      inspectedNodeId: session.session?.inspectedNodeId ?? selectedEvent?.nodeId,
      activeInspectorTab: session.session?.activeInspectorTab ?? (selectedEvent ? "debug" : "trace")
    }
  };
}

export function isReplaySessionExport(value: unknown): value is ReplaySessionExport {
  return validateReplaySessionExport(value).length === 0;
}

export function validateReplaySessionExport(value: unknown): string[] {
  const errors: string[] = [];
  const session = expectRecord(value, "session", errors);

  if (!session) {
    return errors;
  }

  if (session.schema !== REPLAY_SESSION_SCHEMA) {
    errors.push(`session.schema must be "${REPLAY_SESSION_SCHEMA}"`);
  }

  expectString(session, "appVersion", "session.appVersion", errors);
  expectDateString(session, "exportedAt", "session.exportedAt", errors);
  validateWorkflow(session.workflow, "session.workflow", errors);
  validatePortableWorkflow(session.portableWorkflow, "session.portableWorkflow", errors);
  validateTraceEvents(session.trace, "session.trace", errors);
  validateTraceSummary(session.traceSummary, "session.traceSummary", errors);
  validateReplaySessionArtifacts(session.artifacts, "session.artifacts", errors);
  validateCosts(session.costs, "session.costs", errors);
  validateValidationIssues(session.validationIssues, "session.validationIssues", errors);
  validateReplayAttempts(session.replayAttempts, "session.replayAttempts", errors);

  return errors;
}

function restoreTraceMetrics(sanitizedTrace: TraceEvent[], sourceTrace: TraceEvent[]) {
  return sanitizedTrace.map((event, index) => {
    const sourceEvent = sourceTrace[index];

    return {
      ...event,
      durationMs: sourceEvent?.durationMs ?? event.durationMs,
      tokensIn: sourceEvent?.tokensIn ?? event.tokensIn,
      tokensOut: sourceEvent?.tokensOut ?? event.tokensOut,
      costUsd: sourceEvent?.costUsd ?? event.costUsd,
      replayAttempt: sourceEvent?.replayAttempt ?? event.replayAttempt
    };
  });
}

function hardenReplaySessionSanitization<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => hardenReplaySessionSanitization(entry)) as T;
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, hardenReplaySessionSanitization(entry)])
    ) as T;
  }

  if (typeof value === "string") {
    return redactEscapedPathPrefixes(value) as T;
  }

  return value;
}

function redactEscapedPathPrefixes(value: string) {
  return value.replace(/[A-Z]:\\+Users\\+[^\\/"'\s]+/gi, "${userHome}");
}

function collectReplaySessionArtifacts(trace: TraceEvent[]): ReplaySessionArtifact[] {
  return trace.flatMap((event) =>
    (event.artifacts ?? []).map((artifact) => ({
      ...artifact,
      eventId: event.id,
      runId: event.runId,
      nodeId: event.nodeId,
      nodeLabel: event.nodeLabel,
      replayOf: event.replayOf,
      replayAttempt: event.replayAttempt
    }))
  );
}

function collectReplayAttempts(trace: TraceEvent[]): ReplaySessionReplayAttempt[] {
  const attemptsBySource = new Map<string, number>();

  return trace
    .filter((event) => Boolean(event.replayOf))
    .map((event) => {
      const sourceEventId = event.replayOf ?? "";
      const inferredAttempt = (attemptsBySource.get(sourceEventId) ?? 0) + 1;
      const attempt = event.replayAttempt ?? inferredAttempt;
      attemptsBySource.set(sourceEventId, Math.max(attemptsBySource.get(sourceEventId) ?? 0, attempt));

      return {
        id: `${sourceEventId}:${event.id}`,
        sourceEventId,
        replayEventId: event.id,
        runId: event.runId,
        nodeId: event.nodeId,
        nodeLabel: event.nodeLabel,
        attempt,
        status: event.status,
        startedAt: event.startedAt,
        durationMs: event.durationMs,
        costUsd: event.costUsd,
        artifactIds: event.artifacts?.map((artifact) => artifact.id) ?? []
      };
    });
}

function parseReplaySessionInput(input: string | unknown): { ok: true; value: unknown } | { ok: false; errors: string[] } {
  if (typeof input !== "string") {
    return { ok: true, value: input };
  }

  try {
    return { ok: true, value: JSON.parse(input) as unknown };
  } catch (error) {
    return {
      ok: false,
      errors: [`input must be valid JSON: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

function validateWorkflow(value: unknown, path: string, errors: string[]) {
  const workflow = expectRecord(value, path, errors);

  if (!workflow) {
    return;
  }

  expectString(workflow, "id", `${path}.id`, errors);
  expectString(workflow, "name", `${path}.name`, errors);
  expectString(workflow, "tagline", `${path}.tagline`, errors);
  expectString(workflow, "description", `${path}.description`, errors);
  validateWorkflowNodes(workflow.nodes, `${path}.nodes`, errors);
  validateWorkflowEdges(workflow.edges, `${path}.edges`, errors);
}

function validateWorkflowNodes(value: unknown, path: string, errors: string[]) {
  const nodes = expectArray(value, path, errors);

  nodes?.forEach((entry, index) => {
    const nodePath = `${path}[${index}]`;
    const node = expectRecord(entry, nodePath, errors);

    if (!node) {
      return;
    }

    expectString(node, "id", `${nodePath}.id`, errors);
    if (node.type !== "agentNode") {
      errors.push(`${nodePath}.type must be "agentNode"`);
    }
    validatePosition(node.position, `${nodePath}.position`, errors);
    validateNodeData(node.data, `${nodePath}.data`, errors);
  });
}

function validatePosition(value: unknown, path: string, errors: string[]) {
  const position = expectRecord(value, path, errors);

  if (!position) {
    return;
  }

  expectFiniteNumber(position, "x", `${path}.x`, errors);
  expectFiniteNumber(position, "y", `${path}.y`, errors);
}

function validateNodeData(value: unknown, path: string, errors: string[]) {
  const data = expectRecord(value, path, errors);

  if (!data) {
    return;
  }

  expectString(data, "label", `${path}.label`, errors);
  expectEnum<AgentNodeKind>(data, "kind", agentNodeKinds, `${path}.kind`, errors);
  expectString(data, "description", `${path}.description`, errors);
  expectOptionalEnum<ProviderKind>(data, "provider", providerKinds, `${path}.provider`, errors);
  expectOptionalString(data, "model", `${path}.model`, errors);
  expectOptionalString(data, "promptTemplate", `${path}.promptTemplate`, errors);
  expectOptionalFiniteNumber(data, "timeoutMs", `${path}.timeoutMs`, errors);
  expectOptionalEnum(data, "retryPolicy", retryPolicies, `${path}.retryPolicy`, errors);
  expectOptionalEnum(data, "safetyPolicy", safetyPolicies, `${path}.safetyPolicy`, errors);

  if (data.config !== undefined) {
    validateConfigRecord(data.config, `${path}.config`, errors);
  }
}

function validateWorkflowEdges(value: unknown, path: string, errors: string[]) {
  const edges = expectArray(value, path, errors);

  edges?.forEach((entry, index) => {
    const edgePath = `${path}[${index}]`;
    const edge = expectRecord(entry, edgePath, errors);

    if (!edge) {
      return;
    }

    expectString(edge, "id", `${edgePath}.id`, errors);
    expectString(edge, "source", `${edgePath}.source`, errors);
    expectString(edge, "target", `${edgePath}.target`, errors);
    expectOptionalBoolean(edge, "animated", `${edgePath}.animated`, errors);

    if (edge.data !== undefined) {
      validateEdgeData(edge.data, `${edgePath}.data`, errors);
    }
  });
}

function validateEdgeData(value: unknown, path: string, errors: string[]) {
  const data = expectRecord(value, path, errors);

  if (!data) {
    return;
  }

  expectOptionalString(data, "label", `${path}.label`, errors);
  expectOptionalString(data, "condition", `${path}.condition`, errors);
  expectOptionalEnum(data, "route", edgeRoutes, `${path}.route`, errors);
}

function validatePortableWorkflow(value: unknown, path: string, errors: string[]) {
  const workflow = expectRecord(value, path, errors);

  if (!workflow) {
    return;
  }

  expectString(workflow, "id", `${path}.id`, errors);
  expectString(workflow, "name", `${path}.name`, errors);
  expectString(workflow, "description", `${path}.description`, errors);
  validatePortableNodes(workflow.nodes, `${path}.nodes`, errors);
  validatePortableEdges(workflow.edges, `${path}.edges`, errors);
}

function validatePortableNodes(value: unknown, path: string, errors: string[]) {
  const nodes = expectArray(value, path, errors);

  nodes?.forEach((entry, index) => {
    const nodePath = `${path}[${index}]`;
    const node = expectRecord(entry, nodePath, errors);

    if (!node) {
      return;
    }

    expectString(node, "id", `${nodePath}.id`, errors);
    expectEnum<AgentNodeKind>(node, "kind", agentNodeKinds, `${nodePath}.kind`, errors);
    expectString(node, "label", `${nodePath}.label`, errors);
    expectOptionalEnum<ProviderKind>(node, "provider", providerKinds, `${nodePath}.provider`, errors);
    expectOptionalString(node, "model", `${nodePath}.model`, errors);
    expectOptionalString(node, "promptTemplate", `${nodePath}.promptTemplate`, errors);
    expectOptionalFiniteNumber(node, "timeoutMs", `${nodePath}.timeoutMs`, errors);
    expectOptionalEnum(node, "retryPolicy", retryPolicies, `${nodePath}.retryPolicy`, errors);
    expectOptionalEnum(node, "safetyPolicy", safetyPolicies, `${nodePath}.safetyPolicy`, errors);
    validateConfigRecord(node.config, `${nodePath}.config`, errors);
  });
}

function validatePortableEdges(value: unknown, path: string, errors: string[]) {
  const edges = expectArray(value, path, errors);

  edges?.forEach((entry, index) => {
    const edgePath = `${path}[${index}]`;
    const edge = expectRecord(entry, edgePath, errors);

    if (!edge) {
      return;
    }

    expectString(edge, "id", `${edgePath}.id`, errors);
    expectString(edge, "source", `${edgePath}.source`, errors);
    expectString(edge, "target", `${edgePath}.target`, errors);
    expectOptionalString(edge, "label", `${edgePath}.label`, errors);
    expectOptionalString(edge, "condition", `${edgePath}.condition`, errors);
    expectOptionalEnum(edge, "route", edgeRoutes, `${edgePath}.route`, errors);
  });
}

function validateTraceEvents(value: unknown, path: string, errors: string[]) {
  const events = expectArray(value, path, errors);

  events?.forEach((entry, index) => validateTraceEvent(entry, `${path}[${index}]`, errors));
}

function validateTraceEvent(value: unknown, path: string, errors: string[]) {
  const event = expectRecord(value, path, errors);

  if (!event) {
    return;
  }

  expectString(event, "id", `${path}.id`, errors);
  expectString(event, "runId", `${path}.runId`, errors);
  expectString(event, "nodeId", `${path}.nodeId`, errors);
  expectString(event, "nodeLabel", `${path}.nodeLabel`, errors);
  expectEnum<AgentNodeKind>(event, "kind", agentNodeKinds, `${path}.kind`, errors);
  expectEnum(event, "status", traceStatuses, `${path}.status`, errors);
  expectDateString(event, "startedAt", `${path}.startedAt`, errors);
  expectFiniteNumber(event, "durationMs", `${path}.durationMs`, errors);
  expectOptionalEnum<ProviderKind>(event, "provider", providerKinds, `${path}.provider`, errors);
  expectOptionalString(event, "model", `${path}.model`, errors);
  expectFiniteNumber(event, "tokensIn", `${path}.tokensIn`, errors);
  expectFiniteNumber(event, "tokensOut", `${path}.tokensOut`, errors);
  expectFiniteNumber(event, "costUsd", `${path}.costUsd`, errors);
  expectString(event, "summary", `${path}.summary`, errors);
  expectOptionalString(event, "artifact", `${path}.artifact`, errors);
  expectOptionalString(event, "replayOf", `${path}.replayOf`, errors);
  expectOptionalFiniteNumber(event, "replayAttempt", `${path}.replayAttempt`, errors);
  expectOptionalString(event, "inputRef", `${path}.inputRef`, errors);
  expectOptionalString(event, "outputRef", `${path}.outputRef`, errors);
  expectOptionalString(event, "inputPreview", `${path}.inputPreview`, errors);
  expectOptionalString(event, "outputPreview", `${path}.outputPreview`, errors);

  if (event.artifacts !== undefined) {
    validateTraceArtifacts(event.artifacts, `${path}.artifacts`, errors);
  }

  if (event.debug !== undefined) {
    validateTraceDebug(event.debug, `${path}.debug`, errors);
  }

  if (event.error !== undefined) {
    validateTraceError(event.error, `${path}.error`, errors);
  }
}

function validateTraceArtifacts(value: unknown, path: string, errors: string[]) {
  const artifacts = expectArray(value, path, errors);

  artifacts?.forEach((entry, index) => validateTraceArtifact(entry, `${path}[${index}]`, errors));
}

function validateTraceArtifact(value: unknown, path: string, errors: string[]) {
  const artifact = expectRecord(value, path, errors);

  if (!artifact) {
    return;
  }

  expectString(artifact, "id", `${path}.id`, errors);
  expectString(artifact, "name", `${path}.name`, errors);
  expectEnum<TraceArtifactType>(artifact, "type", traceArtifactTypes, `${path}.type`, errors);
  expectString(artifact, "uri", `${path}.uri`, errors);
  expectString(artifact, "content", `${path}.content`, errors);
}

function validateTraceDebug(value: unknown, path: string, errors: string[]) {
  const debug = expectRecord(value, path, errors);

  if (!debug) {
    return;
  }

  expectString(debug, "prompt", `${path}.prompt`, errors);
  expectString(debug, "toolCall", `${path}.toolCall`, errors);
  expectString(debug, "result", `${path}.result`, errors);
  expectOptionalString(debug, "stdout", `${path}.stdout`, errors);
  expectOptionalString(debug, "stderr", `${path}.stderr`, errors);
}

function validateTraceError(value: unknown, path: string, errors: string[]) {
  const traceError = expectRecord(value, path, errors);

  if (!traceError) {
    return;
  }

  expectString(traceError, "code", `${path}.code`, errors);
  expectString(traceError, "message", `${path}.message`, errors);
}

function validateTraceSummary(value: unknown, path: string, errors: string[]) {
  const summary = expectRecord(value, path, errors);

  if (!summary) {
    return;
  }

  expectFiniteNumber(summary, "totalEvents", `${path}.totalEvents`, errors);
  expectFiniteNumber(summary, "failedEvents", `${path}.failedEvents`, errors);
  expectFiniteNumber(summary, "totalCostUsd", `${path}.totalCostUsd`, errors);
  expectFiniteNumber(summary, "totalTokens", `${path}.totalTokens`, errors);
  expectFiniteNumber(summary, "artifactCount", `${path}.artifactCount`, errors);
  expectFiniteNumber(summary, "replayEvents", `${path}.replayEvents`, errors);
  expectFiniteNumber(summary, "replayableFailedEvents", `${path}.replayableFailedEvents`, errors);
  validateCostBreakdown(summary.costByProviderModel, `${path}.costByProviderModel`, errors);
}

function validateReplaySessionArtifacts(value: unknown, path: string, errors: string[]) {
  const artifacts = expectArray(value, path, errors);

  artifacts?.forEach((entry, index) => {
    const artifactPath = `${path}[${index}]`;
    const artifact = expectRecord(entry, artifactPath, errors);

    if (!artifact) {
      return;
    }

    validateTraceArtifact(artifact, artifactPath, errors);
    expectString(artifact, "eventId", `${artifactPath}.eventId`, errors);
    expectString(artifact, "runId", `${artifactPath}.runId`, errors);
    expectString(artifact, "nodeId", `${artifactPath}.nodeId`, errors);
    expectString(artifact, "nodeLabel", `${artifactPath}.nodeLabel`, errors);
    expectOptionalString(artifact, "replayOf", `${artifactPath}.replayOf`, errors);
    expectOptionalFiniteNumber(artifact, "replayAttempt", `${artifactPath}.replayAttempt`, errors);
  });
}

function validateCosts(value: unknown, path: string, errors: string[]) {
  const costs = expectRecord(value, path, errors);

  if (!costs) {
    return;
  }

  expectFiniteNumber(costs, "totalCostUsd", `${path}.totalCostUsd`, errors);
  expectFiniteNumber(costs, "totalTokens", `${path}.totalTokens`, errors);
  validateCostBreakdown(costs.byProviderModel, `${path}.byProviderModel`, errors);
}

function validateCostBreakdown(value: unknown, path: string, errors: string[]) {
  const breakdown = expectArray(value, path, errors);

  breakdown?.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const item = expectRecord(entry, itemPath, errors);

    if (!item) {
      return;
    }

    expectString(item, "id", `${itemPath}.id`, errors);
    expectEnum<ProviderKind | "none">(item, "provider", [...providerKinds, "none"] as const, `${itemPath}.provider`, errors);
    expectString(item, "model", `${itemPath}.model`, errors);
    expectFiniteNumber(item, "events", `${itemPath}.events`, errors);
    expectFiniteNumber(item, "tokensIn", `${itemPath}.tokensIn`, errors);
    expectFiniteNumber(item, "tokensOut", `${itemPath}.tokensOut`, errors);
    expectFiniteNumber(item, "totalTokens", `${itemPath}.totalTokens`, errors);
    expectFiniteNumber(item, "costUsd", `${itemPath}.costUsd`, errors);
  });
}

function validateValidationIssues(value: unknown, path: string, errors: string[]) {
  const issues = expectArray(value, path, errors);

  issues?.forEach((entry, index) => {
    const issuePath = `${path}[${index}]`;
    const issue = expectRecord(entry, issuePath, errors);

    if (!issue) {
      return;
    }

    expectString(issue, "id", `${issuePath}.id`, errors);
    expectEnum(issue, "severity", issueSeverities, `${issuePath}.severity`, errors);
    expectEnum<GraphValidationIssue["code"]>(issue, "code", issueCodes, `${issuePath}.code`, errors);
    expectString(issue, "message", `${issuePath}.message`, errors);
    expectOptionalString(issue, "nodeId", `${issuePath}.nodeId`, errors);
    expectOptionalString(issue, "edgeId", `${issuePath}.edgeId`, errors);
    validateOptionalStringArray(issue.nodeIds, `${issuePath}.nodeIds`, errors);
    validateOptionalStringArray(issue.edgeIds, `${issuePath}.edgeIds`, errors);
  });
}

function validateReplayAttempts(value: unknown, path: string, errors: string[]) {
  const attempts = expectArray(value, path, errors);

  attempts?.forEach((entry, index) => {
    const attemptPath = `${path}[${index}]`;
    const attempt = expectRecord(entry, attemptPath, errors);

    if (!attempt) {
      return;
    }

    expectString(attempt, "id", `${attemptPath}.id`, errors);
    expectString(attempt, "sourceEventId", `${attemptPath}.sourceEventId`, errors);
    expectString(attempt, "replayEventId", `${attemptPath}.replayEventId`, errors);
    expectString(attempt, "runId", `${attemptPath}.runId`, errors);
    expectString(attempt, "nodeId", `${attemptPath}.nodeId`, errors);
    expectString(attempt, "nodeLabel", `${attemptPath}.nodeLabel`, errors);
    expectFiniteNumber(attempt, "attempt", `${attemptPath}.attempt`, errors);
    expectEnum(attempt, "status", traceStatuses, `${attemptPath}.status`, errors);
    expectDateString(attempt, "startedAt", `${attemptPath}.startedAt`, errors);
    expectFiniteNumber(attempt, "durationMs", `${attemptPath}.durationMs`, errors);
    expectFiniteNumber(attempt, "costUsd", `${attemptPath}.costUsd`, errors);
    validateRequiredStringArray(attempt.artifactIds, `${attemptPath}.artifactIds`, errors);
  });
}

function normalizeRunStatus(value: RunStatus | undefined, trace: TraceEvent[]): RunStatus {
  if (value === "idle" || value === "running" || value === "paused" || value === "complete" || value === "failed") {
    return value;
  }

  return trace.some((event) => event.status === "failed") ? "failed" : trace.length > 0 ? "complete" : "idle";
}

function validateConfigRecord(value: unknown, path: string, errors: string[]) {
  const config = expectRecord(value, path, errors);

  if (!config) {
    return;
  }

  Object.entries(config).forEach(([key, entry]) => {
    if (typeof entry !== "string" && typeof entry !== "number" && typeof entry !== "boolean") {
      errors.push(`${path}.${key} must be a string, number, or boolean`);
    }
  });
}

function validateRequiredStringArray(value: unknown, path: string, errors: string[]) {
  const values = expectArray(value, path, errors);

  values?.forEach((entry, index) => {
    if (typeof entry !== "string") {
      errors.push(`${path}[${index}] must be a string`);
    }
  });
}

function validateOptionalStringArray(value: unknown, path: string, errors: string[]) {
  if (value === undefined) {
    return;
  }

  validateRequiredStringArray(value, path, errors);
}

function expectRecord(value: unknown, path: string, errors: string[]): JsonObject | undefined {
  if (isRecord(value)) {
    return value;
  }

  errors.push(`${path} must be an object`);
  return undefined;
}

function expectArray(value: unknown, path: string, errors: string[]): unknown[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }

  errors.push(`${path} must be an array`);
  return undefined;
}

function expectString(record: JsonObject, key: string, path: string, errors: string[]) {
  if (typeof record[key] !== "string") {
    errors.push(`${path} must be a string`);
  }
}

function expectOptionalString(record: JsonObject, key: string, path: string, errors: string[]) {
  if (record[key] !== undefined && typeof record[key] !== "string") {
    errors.push(`${path} must be a string`);
  }
}

function expectFiniteNumber(record: JsonObject, key: string, path: string, errors: string[]) {
  if (typeof record[key] !== "number" || !Number.isFinite(record[key])) {
    errors.push(`${path} must be a finite number`);
  }
}

function expectOptionalFiniteNumber(record: JsonObject, key: string, path: string, errors: string[]) {
  if (record[key] !== undefined && (typeof record[key] !== "number" || !Number.isFinite(record[key]))) {
    errors.push(`${path} must be a finite number`);
  }
}

function expectOptionalBoolean(record: JsonObject, key: string, path: string, errors: string[]) {
  if (record[key] !== undefined && typeof record[key] !== "boolean") {
    errors.push(`${path} must be a boolean`);
  }
}

function expectDateString(record: JsonObject, key: string, path: string, errors: string[]) {
  const value = record[key];

  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    errors.push(`${path} must be a valid date string`);
  }
}

function expectEnum<T extends string>(
  record: JsonObject,
  key: string,
  values: readonly T[],
  path: string,
  errors: string[]
) {
  if (!isOneOf(record[key], values)) {
    errors.push(`${path} must be one of ${values.join(", ")}`);
  }
}

function expectOptionalEnum<T extends string>(
  record: JsonObject,
  key: string,
  values: readonly T[],
  path: string,
  errors: string[]
) {
  if (record[key] !== undefined && !isOneOf(record[key], values)) {
    errors.push(`${path} must be one of ${values.join(", ")}`);
  }
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
