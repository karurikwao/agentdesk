/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TracePanel } from "./TracePanel";
import type { TraceEvent } from "../types/workflow";

const failedEvent: TraceEvent = {
  id: "event-1",
  runId: "run-1",
  nodeId: "browser",
  nodeLabel: "Browser Replay",
  kind: "tool",
  status: "failed",
  startedAt: new Date().toISOString(),
  durationMs: 120,
  provider: "mcp",
  model: "mcp-metadata",
  tokensIn: 10,
  tokensOut: 0,
  costUsd: 0,
  summary: "Simulated browser MCP timeout.",
  artifacts: [
    {
      id: "json",
      name: "Payload",
      type: "json",
      uri: "artifact://payload.json",
      content: "{}"
    },
    {
      id: "stderr",
      name: "Stderr",
      type: "stderr",
      uri: "artifact://stderr.log",
      content: "DEMO_TOOL_TIMEOUT"
    }
  ],
  error: {
    code: "DEMO_TOOL_TIMEOUT",
    message: "Timed out."
  }
};

describe("TracePanel", () => {
  it("selects trace events and exposes failed-step replay", () => {
    const onEventSelect = vi.fn();
    const onReplayFailedStep = vi.fn();

    render(
      <TracePanel
        status="failed"
        events={[failedEvent]}
        activeNodeId="browser"
        selectedTraceEventId="event-1"
        onEventSelect={onEventSelect}
        onReplayFailedStep={onReplayFailedStep}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Inspect Browser Replay" }));
    expect(onEventSelect).toHaveBeenCalledWith(failedEvent);

    fireEvent.click(screen.getByRole("button", { name: "Replay failed step" }));
    expect(onReplayFailedStep).toHaveBeenCalledWith(failedEvent);
    expect(screen.getByText("json")).toBeInTheDocument();
    expect(screen.getByText("stderr")).toBeInTheDocument();
  });
});
