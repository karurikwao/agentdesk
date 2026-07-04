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
  inspectedNodeId?: string;
  issueNodeIds: Set<string>;
  issueEdgeIds: Set<string>;
  onNodesChange: OnNodesChange<AgentFlowNode>;
  onEdgesChange: OnEdgesChange<AgentFlowEdge>;
  onConnect: (connection: Connection) => void;
  onNodeSelect: (nodeId: string) => void;
};

export function WorkflowCanvas({
  nodes,
  edges,
  activeNodeId,
  inspectedNodeId,
  issueNodeIds,
  issueEdgeIds,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeSelect
}: WorkflowCanvasProps) {
  const decoratedNodes = nodes.map((node) => ({
    ...node,
    selected: node.id === inspectedNodeId || node.selected,
    className: [
      node.id === activeNodeId ? "is-running-node" : "",
      node.id === inspectedNodeId ? "is-inspected-node" : "",
      issueNodeIds.has(node.id) ? "has-graph-issue" : ""
    ]
      .filter(Boolean)
      .join(" ")
  }));
  const decoratedEdges = edges.map((edge) => ({
    ...edge,
    className: issueEdgeIds.has(edge.id) ? "has-graph-issue" : edge.className
  }));

  return (
    <ReactFlow<AgentFlowNode, AgentFlowEdge>
      nodes={decoratedNodes}
      edges={decoratedEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => onNodeSelect(node.id)}
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
