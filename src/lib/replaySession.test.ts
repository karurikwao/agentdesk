import { describe, expect, it } from "vitest";
import { demoWorkflows } from "../data/workflows";
import type { AgentWorkflow, TraceEvent } from "../types/workflow";
import { createTraceEvent } from "./runEngine";
import {
  createReplaySessionExport,
  importReplaySession,
  isReplaySessionExport,
  parseReplaySessionImport,
  parseReplaySession,
  REPLAY_SESSION_SCHEMA,
  serializeReplaySessionExport
} from "./replaySession";

describe("replay session helpers", () => {
  it("creates a full sanitized replay-session export", () => {
    const { failed, replay, trace, workflow } = createReplayFixture();
    const session = createReplaySessionExport(workflow, trace);
    const serialized = JSON.stringify(session);

    expect(session.schema).toBe(REPLAY_SESSION_SCHEMA);
    expect(session.workflow.id).toBe(workflow.id);
    expect(session.portableWorkflow.nodes[0]).not.toHaveProperty("position");
    expect(session.traceSummary).toMatchObject({
      totalEvents: 2,
      failedEvents: 1,
      replayEvents: 1
    });
    expect(session.artifacts.length).toBeGreaterThanOrEqual(10);
    expect(session.costs.byProviderModel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "mcp",
          model: "mcp-metadata"
        })
      ])
    );
    expect(session.validationIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing-outgoing",
          nodeId: "orphan-debugger"
        })
      ])
    );
    expect(session.replayAttempts).toEqual([
      expect.objectContaining({
        sourceEventId: failed.id,
        replayEventId: replay.id,
        attempt: 1,
        artifactIds: expect.arrayContaining(replay.artifacts?.map((artifact) => artifact.id) ?? [])
      })
    ]);
    expect(serialized).toContain("${userHome}");
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("Ada");
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("C:\\\\Users");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("sk-1234567890abcdef");
    expect(serialized).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });

  it("imports serialized sessions through runtime guards and recomputes derived fields", () => {
    const { trace, workflow } = createReplayFixture();
    const serialized = serializeReplaySessionExport(workflow, trace);
    const tampered = JSON.parse(serialized) as Record<string, unknown>;

    tampered.traceSummary = {
      ...(tampered.traceSummary as Record<string, unknown>),
      totalEvents: 999
    };
    tampered.artifacts = [];
    tampered.costs = {
      ...(tampered.costs as Record<string, unknown>),
      totalTokens: 0
    };
    tampered.replayAttempts = [];

    expect(isReplaySessionExport(tampered)).toBe(true);

    const parsed = parseReplaySession(tampered);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error(parsed.errors.join("\n"));
    }

    expect(parsed.session.traceSummary.totalEvents).toBe(2);
    expect(parsed.session.costs.totalTokens).toBeGreaterThan(0);
    expect(parsed.session.artifacts.length).toBeGreaterThan(0);
    expect(parsed.session.replayAttempts).toHaveLength(1);
    expect(parsed.session.exportedAt).toBe(tampered.exportedAt);

    const imported = importReplaySession(serialized);

    expect(imported.schema).toBe(REPLAY_SESSION_SCHEMA);
    expect(imported.trace).toHaveLength(2);
  });

  it("preserves non-derived session state and imported MCP servers during import recompute", () => {
    const { failed, replay, trace, workflow } = createReplayFixture();
    const session = createReplaySessionExport({
      workflow,
      trace,
      importedServers: [
        {
          id: "browser",
          type: "stdio",
          command: "npx",
          args: ["@agentdesk/browser-mcp"],
          envKeys: ["BROWSER_PROFILE"],
          headerKeys: [],
          disabled: false,
          riskFlags: ["executes-local-code", "requires-secrets"],
          readiness: {
            level: "review",
            label: "Needs approval",
            detail: "Metadata only."
          },
          capabilities: {
            tools: ["browser"],
            resources: [],
            prompts: [],
            discovery: "requires-approval"
          }
        }
      ],
      session: {
        status: "failed",
        runMode: "ollama",
        selectedTraceEventId: failed.id,
        selectedArtifactId: failed.artifacts?.[0]?.id,
        inspectedNodeId: failed.nodeId,
        activeInspectorTab: "artifacts"
      }
    });

    const parsed = parseReplaySession(JSON.stringify(session));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error(parsed.errors.join("\n"));
    }
    expect(parsed.session.session).toMatchObject({
      status: "failed",
      runMode: "ollama",
      selectedTraceEventId: failed.id,
      inspectedNodeId: failed.nodeId,
      activeInspectorTab: "artifacts"
    });
    expect(parsed.session.importedServers?.[0]).toMatchObject({
      id: "browser",
      readiness: expect.objectContaining({ level: "review" })
    });

    const imported = parseReplaySessionImport(JSON.stringify(session));

    expect(imported.session).toMatchObject({
      status: "failed",
      runMode: "ollama",
      selectedTraceEventId: failed.id,
      inspectedNodeId: failed.nodeId,
      activeInspectorTab: "artifacts"
    });
    expect(imported.importedServers).toHaveLength(1);
    expect(replay.replayAttempt).toBe(1);
  });

  it("redacts validation issues and imported MCP metadata side channels", () => {
    const { trace, workflow } = createReplayFixture();
    const session = createReplaySessionExport({
      workflow,
      trace,
      graphIssues: [
        {
          id: "leaky-label",
          severity: "warning",
          code: "missing-outgoing",
          nodeId: "orphan-debugger",
          message: "C:\\Users\\Ada\\repo token=secret-token has no outgoing edge"
        }
      ],
      importedServers: [
        {
          id: "leaky",
          type: "http",
          command: "C:\\Users\\Ada\\bin\\server.exe",
          args: ["--api-key", "sk-1234567890abcdef"],
          url: "https://user:pass@example.com/mcp?token=secret-token",
          envKeys: ["OPENAI_API_KEY"],
          headerKeys: ["Authorization"],
          disabled: false,
          riskFlags: ["possible-secret-in-url"],
          readiness: {
            level: "review",
            label: "Remote review",
            detail: "Review token=secret-token"
          },
          capabilities: {
            tools: [],
            resources: [],
            prompts: [],
            discovery: "remote-url"
          }
        }
      ],
      session: {
        status: "complete",
        runMode: "demo",
        activeInspectorTab: "debug"
      }
    });
    const serialized = JSON.stringify(session);

    expect(serialized).toContain("[REDACTED]");
    expect(serialized).toContain("${userHome}");
    expect(serialized).not.toContain("Ada");
    expect(serialized).not.toContain("user:pass");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("sk-1234567890abcdef");
  });

  it("rejects malformed replay-session imports", () => {
    const jsonResult = parseReplaySession("{not-json");

    expect(jsonResult.ok).toBe(false);
    if (jsonResult.ok) {
      throw new Error("expected invalid JSON to fail");
    }
    expect(jsonResult.errors[0]).toMatch(/valid JSON/i);

    const malformed = {
      schema: "agentdesk.workflow.v1",
      appVersion: 1,
      exportedAt: "not-a-date",
      workflow: {},
      portableWorkflow: {},
      trace: [{ id: 5 }],
      traceSummary: {},
      artifacts: [{ id: "artifact" }],
      costs: {},
      validationIssues: [{ severity: "bad" }],
      replayAttempts: [{ artifactIds: [1] }]
    };
    const result = parseReplaySession(malformed);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected malformed session to fail");
    }
    expect(result.errors).toEqual(
      expect.arrayContaining([
        `session.schema must be "${REPLAY_SESSION_SCHEMA}"`,
        "session.appVersion must be a string",
        "session.workflow.id must be a string",
        "session.trace[0].id must be a string",
        "session.costs.totalCostUsd must be a finite number"
      ])
    );
    expect(() => importReplaySession(malformed)).toThrow(/Invalid AgentDesk replay session/);
  });
});

function createReplayFixture(): {
  failed: TraceEvent;
  replay: TraceEvent;
  trace: TraceEvent[];
  workflow: AgentWorkflow;
} {
  const workflow: AgentWorkflow = {
    ...demoWorkflows[3],
    description: `${demoWorkflows[3].description} Debug files live in C:\\Users\\Ada\\agentdesk with token=secret-token.`,
    nodes: [
      ...demoWorkflows[3].nodes.map((node) =>
        node.id === "browser-fail"
          ? {
              ...node,
              data: {
                ...node.data,
                config: {
                  ...node.data.config,
                  apiKey: "sk-1234567890abcdef",
                  command: "C:\\Users\\Ada\\bin\\browser.exe"
                }
              }
            }
          : node
      ),
      {
        id: "orphan-debugger",
        type: "agentNode",
        position: { x: 1280, y: 40 },
        data: {
          label: "Orphan Debugger",
          kind: "tool",
          provider: "local",
          description: "Detached diagnostic node that should surface as a validation issue."
        }
      }
    ]
  };
  const failed = createTraceEvent(workflow, "browser-fail", 2, "run-1");
  const failedWithLeaks: TraceEvent = {
    ...failed,
    debug: failed.debug
      ? {
          ...failed.debug,
          result: `${failed.debug.result}\nSaved password=hunter2 and bearer abcdefghijklmnopqrstuvwxyz`
        }
      : undefined,
    artifacts: failed.artifacts?.map((artifact, index) =>
      index === 0
        ? {
            ...artifact,
            content: `${artifact.content}\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz`
          }
        : artifact
    )
  };
  const replay = createTraceEvent(workflow, "browser-fail", 2, "replay-1", {
    replayOf: failedWithLeaks,
    replayAttempt: 1
  });

  return {
    failed: failedWithLeaks,
    replay,
    trace: [failedWithLeaks, replay],
    workflow
  };
}
