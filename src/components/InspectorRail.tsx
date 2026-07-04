import {
  AlertTriangle,
  Boxes,
  Bug,
  CheckCircle2,
  Code2,
  Database,
  FileText,
  Image as ImageIcon,
  ReceiptText,
  TerminalSquare,
  Waypoints
} from "lucide-react";
import type { ReactNode } from "react";
import { McpPanel } from "./McpPanel";
import { TracePanel } from "./TracePanel";
import type {
  AgentFlowNode,
  CostBreakdownItem,
  GraphValidationIssue,
  ImportedMcpServer,
  RunStatus,
  TraceArtifact,
  TraceEvent
} from "../types/workflow";

export type InspectorTab = "trace" | "debug" | "artifacts" | "costs" | "validation" | "mcp";

type InspectorRailProps = {
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  status: RunStatus;
  events: TraceEvent[];
  activeNodeId?: string;
  selectedTraceEventId?: string;
  inspectedNode?: AgentFlowNode;
  latestEvent?: TraceEvent;
  artifacts: TraceArtifact[];
  selectedArtifactId?: string;
  costBreakdown: CostBreakdownItem[];
  graphIssues: GraphValidationIssue[];
  importedServers: ImportedMcpServer[];
  onEventSelect: (event: TraceEvent) => void;
  onReplayFailedStep: (event: TraceEvent) => void;
  onArtifactSelect: (artifactId: string) => void;
  onIssueSelect: (issue: GraphValidationIssue) => void;
  onImportServers: (servers: ImportedMcpServer[]) => void;
  onCreateMcpNodes: () => void;
};

const tabs: Array<{ id: InspectorTab; label: string }> = [
  { id: "trace", label: "Trace" },
  { id: "debug", label: "Debug" },
  { id: "artifacts", label: "Artifacts" },
  { id: "costs", label: "Costs" },
  { id: "validation", label: "Validation" },
  { id: "mcp", label: "MCP" }
];

export function InspectorRail({
  activeTab,
  onTabChange,
  status,
  events,
  activeNodeId,
  selectedTraceEventId,
  inspectedNode,
  latestEvent,
  artifacts,
  selectedArtifactId,
  costBreakdown,
  graphIssues,
  importedServers,
  onEventSelect,
  onReplayFailedStep,
  onArtifactSelect,
  onIssueSelect,
  onImportServers,
  onCreateMcpNodes
}: InspectorRailProps) {
  const selectedArtifact =
    artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? artifacts[0];

  return (
    <aside className="inspector-rail" aria-label="Debugger inspector">
      <div className="inspector-tabs" role="tablist" aria-label="Inspector views">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "is-active" : ""}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="inspector-body">
        {activeTab === "trace" ? (
          <TracePanel
            status={status}
            events={events}
            activeNodeId={activeNodeId}
            selectedTraceEventId={selectedTraceEventId}
            onEventSelect={onEventSelect}
            onReplayFailedStep={onReplayFailedStep}
          />
        ) : null}
        {activeTab === "debug" ? <DebugPanel node={inspectedNode} event={latestEvent} /> : null}
        {activeTab === "artifacts" ? (
          <ArtifactPanel
            artifacts={artifacts}
            selectedArtifact={selectedArtifact}
            onArtifactSelect={onArtifactSelect}
          />
        ) : null}
        {activeTab === "costs" ? <CostPanel items={costBreakdown} /> : null}
        {activeTab === "validation" ? (
          <ValidationPanel issues={graphIssues} onIssueSelect={onIssueSelect} />
        ) : null}
        {activeTab === "mcp" ? (
          <McpPanel
            importedServers={importedServers}
            onImport={onImportServers}
            onCreateNodes={onCreateMcpNodes}
          />
        ) : null}
      </div>
    </aside>
  );
}

function DebugPanel({ node, event }: { node?: AgentFlowNode; event?: TraceEvent }) {
  const prompt = event?.debug?.prompt ?? event?.inputPreview ?? node?.data.promptTemplate ?? node?.data.description;
  const toolCall =
    event?.debug?.toolCall ??
    JSON.stringify(
      {
        kind: node?.data.kind ?? "none",
        provider: node?.data.provider ?? "none",
        model: node?.data.model ?? event?.model ?? "n/a"
      },
      null,
      2
    );
  const result =
    event?.debug?.result ?? event?.outputPreview ?? event?.error?.message ?? "Run this node to capture a result.";

  return (
    <section className="debug-panel panel-shell" aria-label="Node debugger">
      <PanelHeader
        eyebrow="Debug"
        title={node?.data.label ?? "Select a node"}
        detail={event ? `Latest event: ${event.status}` : "No trace event selected"}
      />
      {!node ? (
        <EmptyPanel icon={<Bug size={18} />} text="Click a node or trace event to inspect prompt, tool call, and result." />
      ) : (
        <div className="debug-sections">
          <DebugBlock title="Prompt" icon={<FileText size={14} />} content={prompt ?? "No prompt captured yet."} />
          <DebugBlock title="Tool / Model Call" icon={<Code2 size={14} />} content={toolCall} />
          <DebugBlock title="Result" icon={<TerminalSquare size={14} />} content={result} tone={event?.status === "failed" ? "danger" : "normal"} />
          {event?.debug?.stdout ? (
            <DebugBlock title="Stdout" icon={<TerminalSquare size={14} />} content={event.debug.stdout} />
          ) : null}
          {event?.debug?.stderr ? (
            <DebugBlock title="Stderr" icon={<AlertTriangle size={14} />} content={event.debug.stderr} tone="danger" />
          ) : null}
        </div>
      )}
    </section>
  );
}

function ArtifactPanel({
  artifacts,
  selectedArtifact,
  onArtifactSelect
}: {
  artifacts: TraceArtifact[];
  selectedArtifact?: TraceArtifact;
  onArtifactSelect: (artifactId: string) => void;
}) {
  return (
    <section className="artifact-panel panel-shell" aria-label="Artifact viewer">
      <PanelHeader
        eyebrow="Artifacts"
        title={selectedArtifact?.name ?? "No artifact selected"}
        detail={`${artifacts.length} captured`}
      />
      {artifacts.length === 0 ? (
        <EmptyPanel icon={<Boxes size={18} />} text="Run a workflow to capture JSON, markdown, screenshot, stdout, and stderr artifacts." />
      ) : (
        <div className="artifact-layout">
          <div className="artifact-list" aria-label="Captured artifacts">
            {artifacts.map((artifact) => (
              <button
                key={artifact.id}
                type="button"
                className={artifact.id === selectedArtifact?.id ? "is-active" : ""}
                onClick={() => onArtifactSelect(artifact.id)}
              >
                {artifactIcon(artifact.type)}
                <span>{artifact.name}</span>
                <small>{artifact.type}</small>
              </button>
            ))}
          </div>
          <ArtifactPreview artifact={selectedArtifact} />
        </div>
      )}
    </section>
  );
}

function ArtifactPreview({ artifact }: { artifact?: TraceArtifact }) {
  if (!artifact) {
    return null;
  }

  if (artifact.type === "screenshot") {
    const src = `data:image/svg+xml;utf8,${encodeURIComponent(artifact.content)}`;

    return (
      <div className="artifact-preview artifact-preview--image">
        <img src={src} alt={artifact.name} />
      </div>
    );
  }

  const content =
    artifact.type === "json" ? formatJson(artifact.content) : artifact.content;

  return (
    <pre className={`artifact-preview artifact-preview--${artifact.type}`}>
      <code>{content}</code>
    </pre>
  );
}

function CostPanel({ items }: { items: CostBreakdownItem[] }) {
  const totalCost = items.reduce((sum, item) => sum + item.costUsd, 0);
  const totalTokens = items.reduce((sum, item) => sum + item.totalTokens, 0);

  return (
    <section className="cost-panel panel-shell" aria-label="Cost breakdown">
      <PanelHeader
        eyebrow="Costs"
        title={`$${totalCost.toFixed(4)}`}
        detail={`${totalTokens.toLocaleString()} tokens by provider/model`}
      />
      {items.length === 0 ? (
        <EmptyPanel icon={<ReceiptText size={18} />} text="Run a workflow to see provider and model cost rows." />
      ) : (
        <div className="cost-list">
          {items.map((item) => (
            <div className="cost-row" key={item.id}>
              <div>
                <strong>{item.provider}</strong>
                <span>{item.model}</span>
              </div>
              <div>
                <strong>${item.costUsd.toFixed(4)}</strong>
                <span>{item.events} events</span>
              </div>
              <div>
                <strong>{item.totalTokens.toLocaleString()}</strong>
                <span>{item.tokensIn.toLocaleString()} in / {item.tokensOut.toLocaleString()} out</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ValidationPanel({
  issues,
  onIssueSelect
}: {
  issues: GraphValidationIssue[];
  onIssueSelect: (issue: GraphValidationIssue) => void;
}) {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;

  return (
    <section className="validation-panel panel-shell" aria-label="Graph validation">
      <PanelHeader
        eyebrow="Graph health"
        title={issues.length === 0 ? "Ready to run" : `${errors} errors / ${warnings} warnings`}
        detail="Cycles, missing edges, and unreachable outputs"
      />
      {issues.length === 0 ? (
        <EmptyPanel icon={<CheckCircle2 size={18} />} text="No graph issues detected." />
      ) : (
        <div className="issue-list">
          {issues.map((issue) => (
            <button
              key={issue.id}
              type="button"
              className={`issue-card issue-card--${issue.severity}`}
              onClick={() => onIssueSelect(issue)}
            >
              {issue.severity === "error" ? <AlertTriangle size={15} /> : <Waypoints size={15} />}
              <span>{issue.message}</span>
              <small>{issue.code}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function PanelHeader({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div className="panel-header">
      <div>
        <div className="section-label">{eyebrow}</div>
        <strong>{title}</strong>
      </div>
      <span>{detail}</span>
    </div>
  );
}

function DebugBlock({
  title,
  icon,
  content,
  tone = "normal"
}: {
  title: string;
  icon: ReactNode;
  content: string;
  tone?: "normal" | "danger";
}) {
  return (
    <section className={`debug-block debug-block--${tone}`}>
      <div>
        {icon}
        <strong>{title}</strong>
      </div>
      <pre>
        <code>{content}</code>
      </pre>
    </section>
  );
}

function EmptyPanel({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="empty-state">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function artifactIcon(type: TraceArtifact["type"]) {
  if (type === "screenshot") {
    return <ImageIcon size={14} />;
  }

  if (type === "json") {
    return <Database size={14} />;
  }

  if (type === "markdown") {
    return <FileText size={14} />;
  }

  return <TerminalSquare size={14} />;
}

function formatJson(content: string) {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}
