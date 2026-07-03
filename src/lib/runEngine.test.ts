import { describe, expect, it } from "vitest";
import { demoWorkflows } from "../data/workflows";
import { createTraceEvent, getRunOrder, validateWorkflow } from "./runEngine";

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
});
