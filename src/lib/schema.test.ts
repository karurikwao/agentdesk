import { describe, expect, it } from "vitest";
import { demoWorkflows } from "../data/workflows";
import { createTraceEvent } from "./runEngine";
import { createPortableWorkflow, createTraceSummary } from "./schema";

describe("schema helpers", () => {
  it("creates a portable workflow without React Flow layout fields", () => {
    const portable = createPortableWorkflow(demoWorkflows[0]);

    expect(portable.nodes[0]).toHaveProperty("id");
    expect(portable.nodes[0]).toHaveProperty("kind");
    expect(portable.nodes[0]).not.toHaveProperty("position");
    expect(portable.edges[0]).toHaveProperty("source");
  });

  it("summarizes trace totals", () => {
    expect(
      createTraceSummary([
        {
          id: "a",
          runId: "run",
          nodeId: "node",
          nodeLabel: "Node",
          kind: "model",
          status: "complete",
          startedAt: new Date().toISOString(),
          durationMs: 10,
          tokensIn: 10,
          tokensOut: 5,
          costUsd: 0.1,
          summary: "Done"
        }
      ])
    ).toMatchObject({
      totalEvents: 1,
      failedEvents: 0,
      totalCostUsd: 0.1,
      totalTokens: 15,
      artifactCount: 0,
      replayEvents: 0
    });
  });

  it("summarizes cost, artifacts, and replay events", () => {
    const failed = createTraceEvent(demoWorkflows[3], "browser-fail", 2, "run-1");
    const replay = createTraceEvent(demoWorkflows[3], "browser-fail", 2, "replay-1", {
      replayOf: failed,
      replayAttempt: 1
    });
    const summary = createTraceSummary([failed, replay]);

    expect(summary.artifactCount).toBeGreaterThanOrEqual(8);
    expect(summary.replayEvents).toBe(1);
    expect(summary.replayableFailedEvents).toBe(1);
    expect(summary.costByProviderModel[0]).toMatchObject({
      provider: "mcp",
      model: "mcp-metadata"
    });
  });
});
