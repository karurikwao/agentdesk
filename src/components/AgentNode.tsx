import { memo } from "react";
import { Bot, BrainCircuit, Database, GitBranch, Play, Terminal, Waypoints } from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentFlowNode, AgentNodeKind } from "../types/workflow";

const icons: Record<AgentNodeKind, typeof Bot> = {
  trigger: Play,
  model: BrainCircuit,
  prompt: Terminal,
  tool: Waypoints,
  memory: Database,
  router: GitBranch,
  output: Bot
};

export const AgentNode = memo(function AgentNode({ data, selected }: NodeProps<AgentFlowNode>) {
  const Icon = icons[data.kind];

  return (
    <div className={`agent-node agent-node--${data.kind} ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} className="agent-node__handle" />
      <div className="agent-node__top">
        <span className="agent-node__icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <span className="agent-node__kind">{data.kind}</span>
      </div>
      <div className="agent-node__label">{data.label}</div>
      <p>{data.description}</p>
      {data.provider ? <span className="agent-node__provider">{data.provider}</span> : null}
      <Handle type="source" position={Position.Right} className="agent-node__handle" />
    </div>
  );
});
