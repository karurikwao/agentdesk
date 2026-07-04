import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import { addEdge, ReactFlowProvider, useEdgesState, useNodesState, type Connection } from "@xyflow/react";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { WorkflowCanvas } from "./components/WorkflowCanvas";
import { InspectorRail, type InspectorTab } from "./components/InspectorRail";
import { demoWorkflows } from "./data/workflows";
import { downloadJson } from "./lib/export";
import { createCostBreakdown, createTraceEvent, getRunOrder, validateWorkflowGraph } from "./lib/runEngine";
import { checkOllamaStatus, runOllamaNode } from "./lib/ollama";
import { createReplaySessionExport, parseReplaySessionImport } from "./lib/replaySession";
import {
  collectBrowserCapabilities,
  createReadinessReport,
  defaultOllamaStatus,
  type OllamaReadinessStatus
} from "./lib/readiness";
import type {
  AgentNodeData,
  AgentFlowNode,
  AgentNodeKind,
  AgentWorkflow,
  GraphValidationIssue,
  ImportedMcpServer,
  RunMode,
  RunStatus,
  TraceArtifact,
  TraceEvent
} from "./types/workflow";

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function App() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(demoWorkflows[0].id);
  const [importedWorkflow, setImportedWorkflow] = useState<AgentWorkflow | undefined>();
  const availableWorkflows = useMemo(
    () =>
      importedWorkflow
        ? [importedWorkflow, ...demoWorkflows.filter((workflow) => workflow.id !== importedWorkflow.id)]
        : demoWorkflows,
    [importedWorkflow]
  );
  const selectedWorkflow = useMemo(
    () => availableWorkflows.find((workflow) => workflow.id === selectedWorkflowId) ?? availableWorkflows[0],
    [availableWorkflows, selectedWorkflowId]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentFlowNode>(selectedWorkflow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(selectedWorkflow.edges);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [runMode, setRunMode] = useState<RunMode>("demo");
  const [activeNodeId, setActiveNodeId] = useState<string | undefined>();
  const [inspectedNodeId, setInspectedNodeId] = useState<string | undefined>();
  const [selectedTraceEventId, setSelectedTraceEventId] = useState<string | undefined>();
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | undefined>();
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorTab>("trace");
  const [importedServers, setImportedServers] = useState<ImportedMcpServer[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaReadinessStatus>(defaultOllamaStatus);
  const [sessionNotice, setSessionNotice] = useState("No replay session imported yet.");
  const [sessionError, setSessionError] = useState<string | undefined>();
  const runToken = useRef(0);
  const activeRunAbort = useRef<AbortController | null>(null);
  const currentRunId = useRef<string | undefined>();
  const importInputRef = useRef<HTMLInputElement>(null);
  const browserCapabilities = useMemo(() => collectBrowserCapabilities(), []);

  const runtimeWorkflow: AgentWorkflow = useMemo(
    () => ({
      ...selectedWorkflow,
      nodes,
      edges
    }),
    [edges, nodes, selectedWorkflow]
  );

  const totalCost = trace.reduce((sum, event) => sum + event.costUsd, 0);
  const graphIssues = useMemo(() => validateWorkflowGraph(runtimeWorkflow), [runtimeWorkflow]);
  const issueNodeIds = useMemo(
    () =>
      new Set(
        graphIssues.flatMap((issue) => [
          ...(issue.nodeId ? [issue.nodeId] : []),
          ...(issue.nodeIds ?? [])
        ])
      ),
    [graphIssues]
  );
  const issueEdgeIds = useMemo(
    () =>
      new Set(
        graphIssues.flatMap((issue) => [
          ...(issue.edgeId ? [issue.edgeId] : []),
          ...(issue.edgeIds ?? [])
        ])
      ),
    [graphIssues]
  );
  const costBreakdown = useMemo(() => createCostBreakdown(trace), [trace]);
  const readinessReport = useMemo(
    () =>
      createReadinessReport({
        workflow: runtimeWorkflow,
        graphIssues,
        importedServers,
        runMode,
        capabilities: browserCapabilities,
        ollamaStatus
      }),
    [browserCapabilities, graphIssues, importedServers, ollamaStatus, runMode, runtimeWorkflow]
  );
  const selectedTraceEvent = useMemo(
    () => trace.find((event) => event.id === selectedTraceEventId),
    [selectedTraceEventId, trace]
  );
  const inspectedNode = useMemo(
    () => nodes.find((node) => node.id === inspectedNodeId),
    [inspectedNodeId, nodes]
  );
  const latestEvent = useMemo(
    () => selectedTraceEvent ?? findLatestEventForNode(trace, inspectedNodeId),
    [inspectedNodeId, selectedTraceEvent, trace]
  );
  const artifacts = useMemo(() => collectArtifacts(trace), [trace]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        setActiveInspectorTab("validation");
        return;
      }

      setEdges((currentEdges) => addEdge({ ...connection, animated: true }, currentEdges));
    },
    [setEdges]
  );

  function selectWorkflow(id: string) {
    const workflow = availableWorkflows.find((candidate) => candidate.id === id);

    if (!workflow) {
      return;
    }

    runToken.current += 1;
    activeRunAbort.current?.abort();
    activeRunAbort.current = null;
    currentRunId.current = undefined;
    setSelectedWorkflowId(id);
    setNodes(workflow.nodes);
    setEdges(workflow.edges);
    setTrace([]);
    setStatus("idle");
    setActiveNodeId(undefined);
    setInspectedNodeId(undefined);
    setSelectedTraceEventId(undefined);
    setSelectedArtifactId(undefined);
    setActiveInspectorTab("trace");
    setSessionNotice(
      workflow.id === importedWorkflow?.id
        ? "Imported replay session loaded."
        : "Using a bundled AgentDesk demo workflow."
    );
    setSessionError(undefined);
  }

  function changeRunMode(mode: RunMode) {
    runToken.current += 1;
    activeRunAbort.current?.abort();
    activeRunAbort.current = null;
    currentRunId.current = undefined;
    setRunMode(mode);
    setStatus("idle");
    setActiveNodeId(undefined);
    setInspectedNodeId(undefined);
    setSelectedTraceEventId(undefined);
    setSelectedArtifactId(undefined);
    setActiveInspectorTab("trace");
    setTrace([]);
    setSessionError(undefined);
  }

  function addNode(kind: AgentNodeKind) {
    const id = `${kind}-${Math.round(Date.now() / 100)}`;
    const position = {
      x: 140 + (nodes.length % 4) * 230,
      y: 420 + Math.floor(nodes.length / 4) * 150
    };
    const node: AgentFlowNode = {
      id,
      type: "agentNode",
      position,
      data: {
        label: `${titleCase(kind)} Node`,
        kind,
        provider: kind === "tool" ? "mcp" : kind === "model" ? "ollama" : undefined,
        description: `New ${kind} step ready to configure.`
      }
    };

    setNodes((currentNodes) => [...currentNodes, node]);
    setInspectedNodeId(node.id);
    setSelectedTraceEventId(undefined);
    setSelectedArtifactId(undefined);
    setActiveInspectorTab("validation");
  }

  function addImportedMcpNodes() {
    const importedNodes: AgentFlowNode[] = importedServers.map((server, index) => {
      const serverTarget =
        server.url ?? (`${server.command} ${server.args.join(" ")}`.trim() || "Imported MCP server");
      const serverDescription = `Metadata-only import (${server.readiness.label}): ${serverTarget}`;

      return {
        id: `mcp-${server.id}-${Date.now()}`,
        type: "agentNode",
        position: {
          x: 260 + index * 240,
          y: 620
        },
        data: {
          label: `${server.id} MCP`,
          kind: "tool",
          provider: "mcp",
          description: serverDescription,
          safetyPolicy: "approval-required",
          config: {
            type: server.type,
            command: server.command,
            envKeys: server.envKeys.join(", "),
            headerKeys: server.headerKeys.join(", "),
            riskFlags: server.riskFlags.join(", "),
            readiness: server.readiness.label,
            discovery: server.capabilities.discovery,
            toolHints: server.capabilities.tools.join(", ")
          }
        }
      };
    });

    setNodes((currentNodes) => [...currentNodes, ...importedNodes]);
    setActiveInspectorTab("validation");
  }

  async function runWorkflow() {
    const token = runToken.current + 1;
    activeRunAbort.current?.abort();
    const abortController = new AbortController();
    activeRunAbort.current = abortController;
    runToken.current = token;
    setStatus("running");
    setTrace([]);
    setSelectedTraceEventId(undefined);
    setSelectedArtifactId(undefined);
    setActiveInspectorTab("trace");

    let order: string[];
    try {
      order = getRunOrder(runtimeWorkflow);
    } catch (error) {
      setStatus("failed");
      setActiveNodeId(undefined);
      setActiveInspectorTab("validation");
      setTrace([
        {
          id: `graph-error-${Date.now()}`,
          runId: `run-${Date.now()}`,
          nodeId: "graph",
          nodeLabel: "Graph validation",
          kind: "router",
          status: "failed",
          startedAt: new Date().toISOString(),
          durationMs: 0,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          summary: error instanceof Error ? error.message : "Workflow graph validation failed.",
          error: {
            code: "INVALID_GRAPH",
            message: error instanceof Error ? error.message : "Workflow graph validation failed."
          }
        }
      ]);
      if (activeRunAbort.current === abortController) {
        activeRunAbort.current = null;
        currentRunId.current = undefined;
      }
      return;
    }

    const runId = `run-${Date.now()}`;
    currentRunId.current = runId;

    for (const [index, nodeId] of order.entries()) {
      if (runToken.current !== token) {
        return;
      }

      setActiveNodeId(nodeId);
      await wait(360);

      if (runToken.current !== token) {
        return;
      }

      const node = runtimeWorkflow.nodes.find((candidate) => candidate.id === nodeId);

      if (!node) {
        continue;
      }

      const runsLocallyThroughOllama =
        runMode === "ollama" && node.data.kind === "model" && node.data.provider === "ollama";
      const event = runsLocallyThroughOllama
        ? await runOllamaNode(runtimeWorkflow, node, index, runId, {
            signal: abortController.signal
          })
        : markSimulatedIfLiveMode(createTraceEvent(runtimeWorkflow, nodeId, index, runId), runMode);

      if (runToken.current !== token) {
        return;
      }

      setTrace((currentTrace) => [...currentTrace, event]);
      setInspectedNodeId(event.nodeId);
      setSelectedTraceEventId(event.id);
      setSelectedArtifactId(event.artifacts?.[0]?.id);

      if (event.status === "failed") {
        setActiveNodeId(nodeId);
        setInspectedNodeId(nodeId);
        setSelectedTraceEventId(event.id);
        setSelectedArtifactId(event.artifacts?.[0]?.id);
        setActiveInspectorTab("debug");
        setStatus("failed");
        if (activeRunAbort.current === abortController) {
          activeRunAbort.current = null;
          currentRunId.current = undefined;
        }
        return;
      }
    }

    setActiveNodeId(undefined);
    setStatus("complete");
    if (activeRunAbort.current === abortController) {
      activeRunAbort.current = null;
      currentRunId.current = undefined;
    }
  }

  function stopRun() {
    runToken.current += 1;
    activeRunAbort.current?.abort();
    activeRunAbort.current = null;
    if (status === "running" && activeNodeId) {
      const node = runtimeWorkflow.nodes.find((candidate) => candidate.id === activeNodeId);

      if (node) {
        const cancelledEvent = createCancelledTraceEvent(node, currentRunId.current ?? `run-${Date.now()}`);
        setTrace((currentTrace) => [
          ...currentTrace,
          cancelledEvent
        ]);
        setInspectedNodeId(node.id);
        setSelectedTraceEventId(cancelledEvent.id);
        setSelectedArtifactId(cancelledEvent.artifacts?.[0]?.id);
        setActiveInspectorTab("debug");
      }
    }
    currentRunId.current = undefined;
    setStatus("paused");
    setActiveNodeId(undefined);
  }

  function replayRun() {
    const selectedFailedEvent = selectedTraceEvent?.status === "failed" ? selectedTraceEvent : undefined;

    if (selectedFailedEvent && selectedFailedEvent.nodeId !== "graph") {
      replayFailedStep(selectedFailedEvent);
      return;
    }

    void runWorkflow();
  }

  function replayFailedStep(event: TraceEvent) {
    const nodeIndex = runtimeWorkflow.nodes.findIndex((node) => node.id === event.nodeId);

    if (nodeIndex < 0) {
      return;
    }

    const replayEvent = createTraceEvent(runtimeWorkflow, event.nodeId, nodeIndex, `replay-${Date.now()}`, {
      replayOf: event,
      replayAttempt: trace.filter((traceEvent) => traceEvent.replayOf === event.id).length + 1
    });

    setTrace((currentTrace) => [...currentTrace, replayEvent]);
    setStatus("complete");
    setActiveNodeId(event.nodeId);
    setInspectedNodeId(event.nodeId);
    setSelectedTraceEventId(replayEvent.id);
    setSelectedArtifactId(replayEvent.artifacts?.[0]?.id);
    setActiveInspectorTab("debug");
  }

  function inspectNode(nodeId: string) {
    const event = findLatestEventForNode(trace, nodeId);

    setInspectedNodeId(nodeId);
    setSelectedTraceEventId(event?.id);
    setSelectedArtifactId(event?.artifacts?.[0]?.id);
    setActiveInspectorTab(event ? "debug" : "validation");
  }

  function inspectTraceEvent(event: TraceEvent) {
    setSelectedTraceEventId(event.id);

    if (runtimeWorkflow.nodes.some((node) => node.id === event.nodeId)) {
      setInspectedNodeId(event.nodeId);
      setActiveNodeId(event.nodeId);
    }

    setSelectedArtifactId(event.artifacts?.[0]?.id);
    setActiveInspectorTab("debug");
  }

  function inspectGraphIssue(issue: GraphValidationIssue) {
    if (issue.nodeId) {
      setInspectedNodeId(issue.nodeId);
      setActiveNodeId(issue.nodeId);
    }

    setActiveInspectorTab("validation");
  }

  function exportWorkflow() {
    downloadJson(
      `${runtimeWorkflow.id}.agentdesk-session.json`,
      createReplaySessionExport({
        workflow: runtimeWorkflow,
        trace,
        graphIssues,
        importedServers,
        session: {
          status,
          runMode,
          selectedTraceEventId,
          selectedArtifactId,
          inspectedNodeId,
          activeInspectorTab
        }
      })
    );
  }

  function openReplayImport() {
    importInputRef.current?.click();
  }

  async function importReplaySessionFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const imported = parseReplaySessionImport(text);
      const importedStatus = imported.session.status === "running" ? "paused" : imported.session.status;

      runToken.current += 1;
      activeRunAbort.current?.abort();
      activeRunAbort.current = null;
      currentRunId.current = undefined;
      setImportedWorkflow(imported.workflow);
      setSelectedWorkflowId(imported.workflow.id);
      setNodes(imported.workflow.nodes);
      setEdges(imported.workflow.edges);
      setTrace(imported.trace);
      setStatus(importedStatus);
      setRunMode(imported.session.runMode);
      setActiveNodeId(imported.session.inspectedNodeId);
      setInspectedNodeId(imported.session.inspectedNodeId);
      setSelectedTraceEventId(imported.session.selectedTraceEventId);
      setSelectedArtifactId(imported.session.selectedArtifactId);
      setImportedServers(imported.importedServers);
      setActiveInspectorTab(normalizeInspectorTab(imported.session.activeInspectorTab));
      setSessionNotice(`Imported ${file.name} with ${imported.trace.length} trace event(s).`);
      setSessionError(undefined);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Unable to import replay session.");
      setSessionNotice(`Could not import ${file.name}.`);
      setActiveInspectorTab("doctor");
    } finally {
      input.value = "";
    }
  }

  async function probeOllama() {
    const status = await checkOllamaStatus();

    setOllamaStatus(status);
    setActiveInspectorTab("doctor");
  }

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        <Sidebar
          workflows={availableWorkflows}
          selectedWorkflowId={selectedWorkflowId}
          onSelectWorkflow={selectWorkflow}
          onAddNode={addNode}
        />
        <main className="workspace">
          <Topbar
            title={selectedWorkflow.name}
            description={selectedWorkflow.description}
            status={status}
            nodeCount={nodes.length}
            edgeCount={edges.length}
            totalCost={totalCost}
            runMode={runMode}
            onRunModeChange={changeRunMode}
            onRun={runWorkflow}
            onStop={stopRun}
            onReplay={replayRun}
            onExport={exportWorkflow}
            onImport={openReplayImport}
          />
          <input
            ref={importInputRef}
            data-testid="session-import-input"
            className="visually-hidden"
            type="file"
            accept="application/json,.json,.agentdesk-json"
            onChange={importReplaySessionFile}
          />
          <div className="workspace__body">
            <section className="canvas-shell" aria-label="Workflow canvas">
              <WorkflowCanvas
                nodes={nodes}
                edges={edges}
                activeNodeId={activeNodeId}
                inspectedNodeId={inspectedNodeId}
                issueNodeIds={issueNodeIds}
                issueEdgeIds={issueEdgeIds}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeSelect={inspectNode}
              />
            </section>
            <div className="right-rail">
              <InspectorRail
                activeTab={activeInspectorTab}
                onTabChange={setActiveInspectorTab}
                status={status}
                events={trace}
                activeNodeId={activeNodeId}
                selectedTraceEventId={selectedTraceEventId}
                inspectedNode={inspectedNode}
                latestEvent={latestEvent}
                artifacts={artifacts}
                selectedArtifactId={selectedArtifactId}
                costBreakdown={costBreakdown}
                graphIssues={graphIssues}
                readinessReport={readinessReport}
                ollamaStatus={ollamaStatus}
                importedServers={importedServers}
                sessionNotice={sessionNotice}
                sessionError={sessionError}
                onEventSelect={inspectTraceEvent}
                onReplayFailedStep={replayFailedStep}
                onArtifactSelect={(artifactId) => {
                  setSelectedArtifactId(artifactId);
                  setActiveInspectorTab("artifacts");
                }}
                onIssueSelect={inspectGraphIssue}
                onImportServers={setImportedServers}
                onCreateMcpNodes={addImportedMcpNodes}
                onCheckOllama={probeOllama}
              />
            </div>
          </div>
        </main>
      </div>
    </ReactFlowProvider>
  );
}

function normalizeInspectorTab(tab: string | undefined): InspectorTab {
  return tab === "trace" ||
    tab === "debug" ||
    tab === "artifacts" ||
    tab === "costs" ||
    tab === "validation" ||
    tab === "doctor" ||
    tab === "mcp"
    ? tab
    : "debug";
}

function findLatestEventForNode(trace: TraceEvent[], nodeId?: string) {
  if (!nodeId) {
    return undefined;
  }

  for (let index = trace.length - 1; index >= 0; index -= 1) {
    if (trace[index].nodeId === nodeId) {
      return trace[index];
    }
  }

  return undefined;
}

function collectArtifacts(trace: TraceEvent[]): TraceArtifact[] {
  return trace.flatMap((event) => {
    if (event.artifacts && event.artifacts.length > 0) {
      return event.artifacts;
    }

    if (event.artifact) {
      return [
        {
          id: `${event.id}-legacy-artifact`,
          name: `${event.nodeLabel} artifact`,
          type: "stdout" as const,
          uri: event.artifact,
          content: event.artifact
        }
      ];
    }

    return [];
  });
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function markSimulatedIfLiveMode(event: TraceEvent, runMode: RunMode): TraceEvent {
  if (runMode !== "ollama") {
    return event;
  }

  return {
    ...event,
    costUsd: 0,
    summary: `Simulated in Ollama mode: ${event.summary}`,
    outputPreview: event.outputPreview
      ? `Simulated step only. ${event.outputPreview}`
      : "Simulated step only; no cloud API or MCP tool was executed."
  };
}

function createCancelledTraceEvent(node: AgentFlowNode, runId: string): TraceEvent {
  return {
    id: `cancelled-${node.id}-${Date.now()}`,
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
    summary: "Run cancelled before this step completed.",
    artifacts: [
      {
        id: `cancelled-${node.id}-stderr`,
        name: `${node.data.label} cancellation`,
        type: "stderr",
        uri: `artifact://cancelled/${node.id}/stderr.log`,
        content: "RUN_CANCELLED: The active local request was cancelled by the user."
      }
    ],
    debug: {
      prompt: node.data.promptTemplate ?? node.data.description,
      toolCall: JSON.stringify(
        {
          provider: node.data.provider ?? "none",
          model: node.data.model ?? "n/a",
          kind: node.data.kind
        },
        null,
        2
      ),
      result: "Run cancelled before this step completed.",
      stderr: "RUN_CANCELLED: The active local request was cancelled by the user."
    },
    error: {
      code: "RUN_CANCELLED",
      message: "The active local request was cancelled by the user."
    }
  };
}
