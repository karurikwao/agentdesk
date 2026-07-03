import { Boxes, BrainCircuit, Database, GitBranch, PackagePlus, Route, Waypoints } from "lucide-react";
import type { AgentWorkflow } from "../types/workflow";
import { paletteKinds } from "../data/workflows";

type SidebarProps = {
  workflows: AgentWorkflow[];
  selectedWorkflowId: string;
  onSelectWorkflow: (id: string) => void;
  onAddNode: (kind: (typeof paletteKinds)[number]["kind"]) => void;
};

const paletteIcons = {
  model: BrainCircuit,
  tool: Waypoints,
  router: GitBranch,
  memory: Database,
  output: PackagePlus
};

export function Sidebar({
  workflows,
  selectedWorkflowId,
  onSelectWorkflow,
  onAddNode
}: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Workflow controls">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          <Boxes size={18} />
        </span>
        <div>
          <strong>AgentDesk</strong>
          <span>Visual agent debugger</span>
        </div>
      </div>

      <section className="sidebar__section">
        <div className="section-label">Demos</div>
        <div className="workflow-list">
          {workflows.map((workflow) => (
            <button
              className={`workflow-option ${
                workflow.id === selectedWorkflowId ? "is-active" : ""
              }`}
              key={workflow.id}
              type="button"
              onClick={() => onSelectWorkflow(workflow.id)}
            >
              <span>{workflow.name}</span>
              <small>{workflow.tagline}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="sidebar__section">
        <div className="section-label">Add Node</div>
        <div className="palette">
          {paletteKinds.map((item) => {
            const Icon = paletteIcons[item.kind];

            return (
              <button
                type="button"
                key={item.kind}
                className="palette-item"
                onClick={() => onAddNode(item.kind)}
                title={item.description}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="sidebar__section sidebar__stats">
        <div>
          <span>Mode</span>
          <strong>Local-first</strong>
        </div>
        <div>
          <span>Adapters</span>
          <strong>Ollama / MCP / APIs</strong>
        </div>
      </section>
    </aside>
  );
}
