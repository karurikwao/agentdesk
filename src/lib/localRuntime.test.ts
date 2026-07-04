import { afterEach, describe, expect, it, vi } from "vitest";
import { demoWorkflows } from "../data/workflows";
import { checkLocalRuntime, createRuntimeUnavailableEvent, discoverMcpServer, runRuntimeNode } from "./localRuntime";
import type { ImportedMcpServer, TraceEvent } from "../types/workflow";

describe("local runtime client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports unavailable runtime when status fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("not found")));

    const status = await checkLocalRuntime();

    expect(status.available).toBe(false);
    expect(status.message).toContain("not found");
  });

  it("runs a runtime node through the loopback API", async () => {
    const workflow = demoWorkflows[0];
    const node = workflow.nodes.find((candidate) => candidate.id === "tests")!;
    const event: TraceEvent = createRuntimeUnavailableEvent(workflow, node, 0, "run-1", "ok");
    event.status = "complete";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ event })
      })
    );

    const result = await runRuntimeNode(workflow, node, 0, "run-1");

    expect(result.status).toBe("complete");
    expect(fetch).toHaveBeenCalledWith(
      "/api/runtime/execute-node",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-AgentDesk-Runtime": "1"
        })
      })
    );
  });

  it("normalizes MCP discovery failures", async () => {
    const server: ImportedMcpServer = {
      id: "browser",
      type: "stdio",
      command: "npx",
      args: ["pkg"],
      envKeys: [],
      headerKeys: [],
      riskFlags: [],
      readiness: {
        level: "review",
        label: "Needs approval",
        detail: "Review"
      },
      capabilities: {
        tools: [],
        resources: [],
        prompts: [],
        discovery: "requires-approval"
      }
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: "timeout" })
      })
    );

    const result = await discoverMcpServer(server, "{}");

    expect(result).toMatchObject({
      serverId: "browser",
      status: "failed",
      message: "timeout"
    });
  });

  it("rejects invalid MCP discovery payloads from static hosts", async () => {
    const server: ImportedMcpServer = {
      id: "browser",
      type: "http",
      command: "",
      url: "https://example.test/mcp",
      args: [],
      envKeys: [],
      headerKeys: [],
      riskFlags: [],
      readiness: {
        level: "ready",
        label: "Ready",
        detail: "Ready"
      },
      capabilities: {
        tools: [],
        resources: [],
        prompts: [],
        discovery: "remote-url"
      }
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => undefined
      })
    );

    const result = await discoverMcpServer(server, "{}");

    expect(result).toMatchObject({
      serverId: "browser",
      status: "failed"
    });
    expect(result.message).toContain("packaged CLI");
  });
});
