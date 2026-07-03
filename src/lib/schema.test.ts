import { describe, expect, it } from "vitest";
import { demoWorkflows } from "../data/workflows";
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
      totalTokens: 15
    });
  });
});
