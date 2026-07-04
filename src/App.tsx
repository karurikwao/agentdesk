import { useCallback, useMemo, useRef, useState } from "react";
import { addEdge, ReactFlowProvider, useEdgesState, useNodesState, type Connection } from "@xyflow/react";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { TracePanel } from "./components/TracePanel";
import { WorkflowCanvas } from "./components/WorkflowCanvas";
import { McpPanel } from "./components/McpPanel";
import { demoWorkflows } from "./data/workflows";
import { createWorkflowExport, downloadJson } from "./lib/export";
import { createTraceEvent, getRunOrder } from "./lib/runEngine";
import { runOllamaNode } from "./lib/ollama";
import type {
  AgentNodeData,
  AgentFlowNode,
  AgentNodeKind,
  AgentWorkflow,
  ImportedMcpServer,
  RunMode,
  RunStatus,
  TraceEvent
} from "./types/workflow";

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function App() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(demoWorkflows[0].id);
  const selectedWorkflow = useMemo(
    () => demoWorkflows.find((workflow) => workflow.id === selectedWorkflowId) ?? demoWorkflows[0],
    [selectedWorkflowId]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentFlowNode>(selectedWorkflow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(selectedWorkflow.edges);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [runMode, setRunMode] = useState<RunMode>("demo");
  const [activeNodeId, setActiveNodeId] = useState<string | undefined>();
  const [importedServers, setImportedServers] = useState<ImportedMcpServer[]>([]);
  const runToken = useRef(0);
  const activeRunAbort = useRef<AbortController | null>(null);
  const currentRunId = useRef<string | undefined>();

  const runtimeWorkflow: AgentWorkflow = useMemo(
    () => ({
      ...selectedWorkflow,
      nodes,
      edges
    }),
    [edges, nodes, selectedWorkflow]
  );

  const totalCost = trace.reduce((sum, event) => sum + event.costUsd, 0);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) => addEdge({ ...connection, animated: true }, currentEdges));
    },
    [setEdges]
  );

  function selectWorkflow(id: string) {
    const workflow = demoWorkflows.find((candidate) => candidate.id === id);

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
  }

  function changeRunMode(mode: RunMode) {
    runToken.current += 1;
    activeRunAbort.current?.abort();
    activeRunAbort.current = null;
    currentRunId.current = undefined;
    setRunMode(mode);
    setStatus("idle");
    setActiveNodeId(undefined);
    setTrace([]);
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
  }

  async function runWorkflow() {
    const token = runToken.current + 1;
    activeRunAbort.current?.abort();
    const abortController = new AbortController();
    activeRunAbort.current = abortController;
    runToken.current = token;
    setStatus("running");
    setTrace([]);

    let order: string[];
    try {
      order = getRunOrder(runtimeWorkflow);
    } catch (error) {
      setStatus("failed");
      setActiveNodeId(undefined);
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

      if (event.status === "failed") {
        setActiveNodeId(undefined);
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
        setTrace((currentTrace) => [
          ...currentTrace,
          createCancelledTraceEvent(node, currentRunId.current ?? `run-${Date.now()}`)
        ]);
      }
    }
    currentRunId.current = undefined;
    setStatus("paused");
    setActiveNodeId(undefined);
  }

  function replayRun() {
    void runWorkflow();
  }

  function exportWorkflow() {
    downloadJson(`${runtimeWorkflow.id}.agentdesk.json`, createWorkflowExport(runtimeWorkflow, trace));
  }

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        <Sidebar
          workflows={demoWorkflows}
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
          />
          <div className="workspace__body">
            <section className="canvas-shell" aria-label="Workflow canvas">
              <WorkflowCanvas
                nodes={nodes}
                edges={edges}
                activeNodeId={activeNodeId}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
              />
            </section>
            <div className="right-rail">
              <TracePanel status={status} events={trace} activeNodeId={activeNodeId} />
              <McpPanel
                importedServers={importedServers}
                onImport={setImportedServers}
                onCreateNodes={addImportedMcpNodes}
              />
            </div>
          </div>
        </main>
      </div>
    </ReactFlowProvider>
  );
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
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    summary: "Run cancelled before this step completed.",
    error: {
      code: "RUN_CANCELLED",
      message: "The active local request was cancelled by the user."
    }
  };
}
