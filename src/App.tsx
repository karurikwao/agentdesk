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
import { runCloudLlmNode } from "./lib/cloudLlm";
import {
  checkLocalRuntime,
  createRuntimeUnavailableEvent,
  discoverMcpServer,
  runRuntimeNode,
  type LocalRuntimeStatus
} from "./lib/localRuntime";
import { sampleMcpConfig } from "./lib/mcp";
import {
  defaultLlmRuntimeConfig,
  hasUsableCloudConfig,
  isCloudLlmProvider,
  type LlmRuntimeConfig
} from "./lib/llmConfig";
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
const defaultWorkflowId = demoWorkflows.find((workflow) => workflow.id === "failure-replay")?.id ?? demoWorkflows[0].id;

export function App() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(defaultWorkflowId);
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
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorTab>("start");
  const [importedServers, setImportedServers] = useState<ImportedMcpServer[]>([]);
  const [mcpConfigText, setMcpConfigText] = useState(sampleMcpConfig);
  const [runtimeStatus, setRuntimeStatus] = useState<LocalRuntimeStatus>({
    available: false,
    enabled: false,
    version: "unchecked",
    capabilities: [],
    message: "Local runtime has not been checked yet."
  });
  const [ollamaStatus, setOllamaStatus] = useState<OllamaReadinessStatus>(defaultOllamaStatus);
  const [llmConfig, setLlmConfig] = useState<LlmRuntimeConfig>(defaultLlmRuntimeConfig);
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
        ollamaStatus,
        runtimeStatus
      }),
    [browserCapabilities, graphIssues, importedServers, ollamaStatus, runMode, runtimeStatus, runtimeWorkflow]
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
  const cloudModelNodeCount = useMemo(
    () => nodes.filter((node) => node.data.kind === "model" && isCloudLlmProvider(node.data.provider)).length,
    [nodes]
  );
  const configuredCloudModelNodeCount = useMemo(
    () =>
      nodes.filter(
        (node) =>
          node.data.kind === "model" &&
          node.data.provider === llmConfig.provider &&
          hasUsableCloudConfig(llmConfig, node.data.provider)
      ).length,
    [llmConfig, nodes]
  );

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
    setActiveInspectorTab("start");
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
    setActiveInspectorTab(mode === "cloud" ? "llms" : mode === "runtime" ? "doctor" : "trace");
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
            mcpServerId: server.id,
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

  function updateLlmConfig(nextConfig: LlmRuntimeConfig) {
    setLlmConfig({
      ...nextConfig,
      updatedAt: new Date().toISOString()
    });
    setSessionError(undefined);
  }

  function forgetLlmKey() {
    setLlmConfig((currentConfig) => ({
      ...currentConfig,
      apiKey: "",
      updatedAt: new Date().toISOString()
    }));
    setSessionNotice(`${llmConfig.provider} API key cleared from this browser session.`);
    setSessionError(undefined);
  }

  function applyLlmConfigToNodes() {
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.data.kind === "model" && node.data.provider === llmConfig.provider
          ? {
              ...node,
              data: {
                ...node.data,
                model: llmConfig.model,
                timeoutMs: node.data.timeoutMs ?? 30000
              }
            }
          : node
      )
    );
    setSessionNotice(`Applied ${llmConfig.model} to ${llmConfig.provider} model nodes.`);
    setActiveInspectorTab("llms");
  }

  function selectFailureReplayLab() {
    selectWorkflow("failure-replay");
    setActiveInspectorTab("trace");
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
        (runMode === "ollama" || runMode === "runtime") &&
        node.data.kind === "model" &&
        node.data.provider === "ollama";
      const runsThroughCloudProvider =
        (runMode === "cloud" || runMode === "runtime") &&
        node.data.kind === "model" &&
        hasUsableCloudConfig(llmConfig, node.data.provider);
      const runsThroughLocalRuntime = runMode === "runtime" && canRunThroughLocalRuntime(node);
      const missingRuntimeModelConfig =
        runMode === "runtime" &&
        node.data.kind === "model" &&
        isCloudLlmProvider(node.data.provider) &&
        !hasUsableCloudConfig(llmConfig, node.data.provider);
      const event = runsLocallyThroughOllama
        ? await runOllamaNode(runtimeWorkflow, node, index, runId, {
            signal: abortController.signal
          })
        : runsThroughCloudProvider
        ? await runCloudLlmNode(runtimeWorkflow, node, index, runId, llmConfig, {
            signal: abortController.signal
          })
        : runsThroughLocalRuntime
        ? await runRuntimeStep(runtimeWorkflow, node, index, runId, abortController, mcpConfigText)
        : missingRuntimeModelConfig
        ? createRuntimeUnavailableEvent(
            runtimeWorkflow,
            node,
            index,
            runId,
            `${node.data.label} is a cloud model node without a matching BYOK provider configuration. Add an API key in LLMs or switch to Demo mode.`
          )
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

  async function probeLocalRuntime() {
    const status = await checkLocalRuntime();

    setRuntimeStatus(status);
    setSessionNotice(status.message);
    setSessionError(status.available ? undefined : status.message);
    setActiveInspectorTab("doctor");
  }

  async function discoverImportedMcp(server: ImportedMcpServer) {
    const result = await discoverMcpServer(server, mcpConfigText);

    setImportedServers((currentServers) =>
      currentServers.map((candidate) =>
        candidate.id === server.id
          ? {
              ...candidate,
              readiness:
                result.status === "available"
                  ? {
                      level: "ready",
                      label: "Live discovered",
                      detail: result.message
                    }
                  : {
                      level: "review",
                      label: "Discovery failed",
                      detail: result.message
                    },
              capabilities: {
                tools: result.tools,
                resources: result.resources,
                prompts: result.prompts,
                discovery: result.status === "available" ? "live-discovered" : candidate.capabilities.discovery
              },
              runtime: {
                lastCheckedAt: new Date().toISOString(),
                status: result.status,
                message: result.message,
                serverInfo: result.serverInfo,
                protocolVersion: result.protocolVersion,
                toolDescriptors: result.toolDescriptors
              }
            }
          : candidate
      )
    );
    setSessionNotice(`${server.id}: ${result.message}`);
    setSessionError(result.status === "available" ? undefined : result.message);
    setActiveInspectorTab("mcp");
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
                runtimeStatus={runtimeStatus}
                runMode={runMode}
                workflowName={selectedWorkflow.name}
                cloudModelNodeCount={cloudModelNodeCount}
                configuredCloudModelNodeCount={configuredCloudModelNodeCount}
                llmConfig={llmConfig}
                importedServers={importedServers}
                sessionNotice={sessionNotice}
                sessionError={sessionError}
                onRunDemo={runWorkflow}
                onOpenLlms={() => setActiveInspectorTab("llms")}
                onOpenTrace={() => setActiveInspectorTab("trace")}
                onOpenDoctor={() => setActiveInspectorTab("doctor")}
                onSelectFailureReplay={selectFailureReplayLab}
                onRunModeChange={changeRunMode}
                onLlmConfigChange={updateLlmConfig}
                onForgetLlmKey={forgetLlmKey}
                onApplyLlmConfigToNodes={applyLlmConfigToNodes}
                onEventSelect={inspectTraceEvent}
                onReplayFailedStep={replayFailedStep}
                onArtifactSelect={(artifactId) => {
                  setSelectedArtifactId(artifactId);
                  setActiveInspectorTab("artifacts");
                }}
                onIssueSelect={inspectGraphIssue}
                onImportServers={setImportedServers}
                onImportMcpConfigText={setMcpConfigText}
                onDiscoverMcpServer={discoverImportedMcp}
                onCreateMcpNodes={addImportedMcpNodes}
                onCheckOllama={probeOllama}
                onCheckRuntime={probeLocalRuntime}
              />
            </div>
          </div>
        </main>
      </div>
    </ReactFlowProvider>
  );
}

function normalizeInspectorTab(tab: string | undefined): InspectorTab {
  return tab === "start" ||
    tab === "trace" ||
    tab === "debug" ||
    tab === "artifacts" ||
    tab === "costs" ||
    tab === "validation" ||
    tab === "doctor" ||
    tab === "llms" ||
    tab === "mcp"
    ? tab
    : "start";
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
  if (runMode === "demo") {
    return event;
  }

  const modeLabel =
    runMode === "ollama" ? "Ollama mode" : runMode === "cloud" ? "Cloud BYOK mode" : "Runtime mode";
  const fallback =
    runMode === "ollama"
      ? "Simulated step only; only Ollama model nodes execute locally in Ollama mode."
      : runMode === "cloud"
        ? "Simulated step only; only configured OpenAI/Anthropic model nodes execute in Cloud BYOK mode."
        : "Runtime metadata step; model and external tool execution require a configured local runtime adapter.";

  return {
    ...event,
    costUsd: 0,
    summary: `Simulated in ${modeLabel}: ${event.summary}`,
    outputPreview: event.outputPreview
      ? `${fallback} ${event.outputPreview}`
      : fallback
  };
}

function canRunThroughLocalRuntime(node: AgentFlowNode) {
  return (
    node.data.provider === "local" ||
    node.data.provider === "mcp" ||
    (node.data.kind !== "model" && node.data.kind !== "trigger")
  );
}

async function runRuntimeStep(
  workflow: AgentWorkflow,
  node: AgentFlowNode,
  index: number,
  runId: string,
  abortController: AbortController,
  mcpConfigText: string
) {
  try {
    return await runRuntimeNode(workflow, node, index, runId, {
      mcpConfigText: node.data.provider === "mcp" ? mcpConfigText : undefined,
      signal: abortController.signal
    });
  } catch (error) {
    return createRuntimeUnavailableEvent(
      workflow,
      node,
      index,
      runId,
      error instanceof Error ? error.message : "Local runtime execution failed."
    );
  }
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
