import { describe, expect, it } from "vitest";
import { createWorkflowExport } from "./export";
import type { AgentWorkflow, TraceEvent } from "../types/workflow";

describe("workflow export", () => {
  it("redacts secrets and private path prefixes from exported workflow data", () => {
    const workflow: AgentWorkflow = {
      id: "export-redaction",
      name: "Export redaction",
      tagline: "Redaction",
      description: "Uses C:\\Users\\Ada\\workspace with token=secret-token.",
      nodes: [
        {
          id: "tool",
          type: "agentNode",
          position: { x: 0, y: 0 },
          data: {
            label: "Tool",
            kind: "tool",
            description: "Run /Users/ada/workspace/server",
            config: {
              command: "C:\\Users\\Ada\\bin\\server.exe",
              url: "postgres://user:pass@example.com/db?password=secret#token",
              apiKey: "sk-1234567890abcdef"
            }
          }
        }
      ],
      edges: []
    };
    const trace: TraceEvent[] = [
      {
        id: "event",
        runId: "run",
        nodeId: "tool",
        nodeLabel: "Tool",
        kind: "tool",
        status: "complete",
        startedAt: new Date().toISOString(),
        durationMs: 1,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        provider: "openai",
        model: "sk-1234567890abcdef",
        summary: "Called https://user:pass@example.com/api/token/sk-1234567890abcdef?token=secret#secret",
        debug: {
          prompt: "Use password=secret and bearer abcdefghijklmnopqrstuvwxyz",
          toolCall: JSON.stringify({ Authorization: "Bearer abcdefghijklmnopqrstuvwxyz" }),
          result: "Saved token=secret-token"
        },
        artifacts: [
          {
            id: "artifact",
            name: "Payload",
            type: "json",
            uri: "artifact://payload.json",
            content: "postgres://user:pass@example.com/db?password=secret#token"
          }
        ]
      }
    ];

    const exportPayload = createWorkflowExport(workflow, trace);
    const serialized = JSON.stringify(exportPayload);

    expect(exportPayload).toHaveProperty("portableWorkflow");
    expect(exportPayload).toHaveProperty("traceSummary");
    expect(exportPayload.traceSummary).toMatchObject({
      totalEvents: 1,
      failedEvents: 0
    });
    expect(serialized).toContain("${userHome}");
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("Ada");
    expect(serialized).not.toContain("ada");
    expect(serialized).not.toContain("user:pass");
    expect(serialized).not.toContain("password=secret");
    expect(serialized).not.toContain("#token");
    expect(serialized).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("sk-1234567890abcdef");
  });
});
