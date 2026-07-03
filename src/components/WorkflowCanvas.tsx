import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange
} from "@xyflow/react";
import { AgentNode } from "./AgentNode";
import type { AgentFlowEdge, AgentFlowNode } from "../types/workflow";

const nodeTypes: NodeTypes = {
  agentNode: AgentNode
};

type WorkflowCanvasProps = {
  nodes: AgentFlowNode[];
  edges: AgentFlowEdge[];
  activeNodeId?: string;
  onNodesChange: OnNodesChange<AgentFlowNode>;
  onEdgesChange: OnEdgesChange<AgentFlowEdge>;
  onConnect: (connection: Connection) => void;
};

export function WorkflowCanvas({
  nodes,
  edges,
  activeNodeId,
  onNodesChange,
  onEdgesChange,
  onConnect
}: WorkflowCanvasProps) {
  const decoratedNodes = nodes.map((node) => ({
    ...node,
    className: node.id === activeNodeId ? "is-running-node" : undefined
  }));

  return (
    <ReactFlow<AgentFlowNode, AgentFlowEdge>
      nodes={decoratedNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 0.95 }}
      minZoom={0.35}
      maxZoom={1.4}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#cbdaf0" gap={24} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(node) => (node.id === activeNodeId ? "#2563eb" : "#7c3aed")}
        maskColor="rgba(248, 250, 252, 0.72)"
      />
    </ReactFlow>
  );
}
