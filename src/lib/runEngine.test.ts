import { describe, expect, it } from "vitest";
import { demoWorkflows } from "../data/workflows";
import {
  createCostBreakdown,
  createTraceEvent,
  getRunOrder,
  validateWorkflow,
  validateWorkflowGraph
} from "./runEngine";

describe("runEngine", () => {
  it("creates a topological run order for the demo graph", () => {
    const order = getRunOrder(demoWorkflows[0]);

    expect(order[0]).toBe("trigger");
    expect(order).toContain("reviewer");
    expect(order.indexOf("planner")).toBeLessThan(order.indexOf("tests"));
    expect(order.indexOf("memory")).toBeLessThan(order.indexOf("reviewer"));
  });

  it("creates trace events with stable run ids and payload refs", () => {
    const event = createTraceEvent(demoWorkflows[0], "planner", 1, "run-1");

    expect(event.runId).toBe("run-1");
    expect(event.nodeLabel).toBe("Planning Agent");
    expect(event.inputRef).toContain("planner");
    expect(event.outputRef).toContain("planner");
    expect(event.model).toBe("simulated-claude");
    expect(event.debug?.prompt).toContain("Planning Agent");
    expect(event.artifacts?.map((artifact) => artifact.type)).toEqual(["json", "markdown"]);
  });

  it("creates failed-step replay events with linked artifacts", () => {
    const failed = createTraceEvent(demoWorkflows[3], "browser-fail", 2, "run-1");
    const replay = createTraceEvent(demoWorkflows[3], "browser-fail", 2, "replay-1", {
      replayOf: failed,
      replayAttempt: 1
    });

    expect(failed.status).toBe("failed");
    expect(failed.artifacts?.map((artifact) => artifact.type)).toEqual([
      "json",
      "markdown",
      "stdout",
      "stderr",
      "screenshot"
    ]);
    expect(replay.status).toBe("complete");
    expect(replay.replayOf).toBe(failed.id);
    expect(replay.replayAttempt).toBe(1);
    expect(replay.summary).toMatch(/replayed/i);
    expect(new Set(replay.artifacts?.map((artifact) => artifact.id)).size).toBe(replay.artifacts?.length);
  });

  it("redacts sensitive node config from debug tool calls", () => {
    const workflow = {
      ...demoWorkflows[0],
      nodes: [
        {
          ...demoWorkflows[0].nodes[2],
          data: {
            ...demoWorkflows[0].nodes[2].data,
            config: {
              apiKey: "sk-1234567890abcdef",
              refreshToken: "refresh-token-value",
              safeMode: true
            }
          }
        }
      ],
      edges: []
    };
    const event = createTraceEvent(workflow, "browser", 0, "run-1");

    expect(event.debug?.toolCall).toContain("[REDACTED]");
    expect(event.debug?.toolCall).toContain("safeMode");
    expect(event.debug?.toolCall).not.toContain("sk-1234567890abcdef");
    expect(event.debug?.toolCall).not.toContain("refresh-token-value");
  });

  it("rejects cyclic graphs", () => {
    const workflow = {
      ...demoWorkflows[0],
      nodes: demoWorkflows[0].nodes.slice(0, 2),
      edges: [
        { id: "a", source: "trigger", target: "planner" },
        { id: "b", source: "planner", target: "trigger" }
      ]
    };

    expect(() => getRunOrder(workflow)).toThrow(/cycle/i);
    expect(validateWorkflowGraph(workflow)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "cycle",
          nodeIds: expect.arrayContaining(["trigger", "planner"]),
          edgeIds: expect.arrayContaining(["a", "b"])
        })
      ])
    );
  });

  it("reports dangling edge endpoints", () => {
    const workflow = {
      ...demoWorkflows[0],
      edges: [{ id: "bad", source: "missing", target: "trigger" }]
    };

    expect(validateWorkflow(workflow)).toContain(
      'edge "bad" has missing source "missing"'
    );
  });

  it("reports structured graph validation issues", () => {
    const workflow = {
      ...demoWorkflows[0],
      edges: [
        { id: "dup", source: "trigger", target: "planner" },
        { id: "dup", source: "planner", target: "planner" },
        { id: "missing", source: "planner", target: "gone" }
      ]
    };
    const issues = validateWorkflowGraph(workflow);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate-edge", severity: "error" }),
        expect.objectContaining({ code: "self-loop", severity: "error" }),
        expect.objectContaining({ code: "missing-target", severity: "error" })
      ])
    );
  });

  it("reports duplicate node ids with node scope", () => {
    const workflow = {
      ...demoWorkflows[0],
      nodes: [
        demoWorkflows[0].nodes[0],
        {
          ...demoWorkflows[0].nodes[1],
          id: demoWorkflows[0].nodes[0].id
        }
      ],
      edges: []
    };

    expect(validateWorkflowGraph(workflow)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate-node", nodeId: "trigger" })
      ])
    );
  });

  it("warns about unreachable outputs and non-output dead ends", () => {
    const workflow = {
      ...demoWorkflows[0],
      nodes: demoWorkflows[0].nodes,
      edges: demoWorkflows[0].edges.filter((edge) => edge.target !== "reviewer")
    };
    const issues = validateWorkflowGraph(workflow);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unreachable-output", nodeId: "reviewer" }),
        expect.objectContaining({ code: "missing-outgoing", nodeId: "memory" })
      ])
    );
  });

  it("allows prompt-start workflows without missing-incoming noise", () => {
    const issues = validateWorkflowGraph(demoWorkflows[3]);

    expect(issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing-incoming", nodeId: "intent" })
      ])
    );
  });

  it("rejects empty workflows", () => {
    const workflow = {
      ...demoWorkflows[0],
      nodes: [],
      edges: []
    };

    expect(validateWorkflowGraph(workflow)).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: "workflow has no nodes" })])
    );
    expect(() => getRunOrder(workflow)).toThrow(/no nodes/i);
  });

  it("groups costs by provider and model", () => {
    const events = [
      createTraceEvent(demoWorkflows[0], "planner", 1, "run-1"),
      createTraceEvent(demoWorkflows[0], "reviewer", 5, "run-1")
    ];
    const breakdown = createCostBreakdown(events);

    expect(breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "anthropic", model: "simulated-claude" }),
        expect.objectContaining({ provider: "openai", model: "simulated-gpt" })
      ])
    );
  });
});
