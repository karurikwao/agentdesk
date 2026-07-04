import type { AgentWorkflow, TraceEvent } from "../types/workflow";
import { createCostBreakdown } from "./runEngine";

export function createPortableWorkflow(workflow: AgentWorkflow) {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      kind: node.data.kind,
      label: node.data.label,
      provider: node.data.provider,
      model: node.data.model,
      promptTemplate: node.data.promptTemplate,
      timeoutMs: node.data.timeoutMs,
      retryPolicy: node.data.retryPolicy,
      safetyPolicy: node.data.safetyPolicy,
      config: node.data.config ?? {}
    })),
    edges: workflow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.data?.label,
      condition: edge.data?.condition,
      route: edge.data?.route
    }))
  };
}

export function createTraceSummary(trace: TraceEvent[]) {
  return {
    totalEvents: trace.length,
    failedEvents: trace.filter((event) => event.status === "failed").length,
    totalCostUsd: Number(trace.reduce((sum, event) => sum + event.costUsd, 0).toFixed(4)),
    totalTokens: trace.reduce((sum, event) => sum + event.tokensIn + event.tokensOut, 0),
    artifactCount: trace.reduce((sum, event) => sum + (event.artifacts?.length ?? (event.artifact ? 1 : 0)), 0),
    replayEvents: trace.filter((event) => event.replayOf).length,
    replayableFailedEvents: trace.filter(
      (event) => event.status === "failed" && event.nodeId !== "graph" && Boolean(event.debug || event.artifacts?.length)
    ).length,
    costByProviderModel: createCostBreakdown(trace)
  };
}
