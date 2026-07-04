import { afterEach, describe, expect, it, vi } from "vitest";
import { demoWorkflows } from "../data/workflows";
import { defaultLlmRuntimeConfig } from "./llmConfig";
import { runCloudLlmNode } from "./cloudLlm";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("cloudLlm", () => {
  it("calls the OpenAI Responses endpoint without leaking the API key into debug data", async () => {
    const workflow = demoWorkflows[1];
    const node = workflow.nodes.find((candidate) => candidate.id === "cloud");

    if (!node) {
      throw new Error("missing cloud node");
    }

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          id: "resp_123",
          model: "gpt-5.5",
          output_text: "Cloud synthesis complete.",
          usage: { input_tokens: 22, output_tokens: 6 }
        }),
        { status: 200 }
      )
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const event = await runCloudLlmNode(workflow, node, 4, "run-1", {
      ...defaultLlmRuntimeConfig,
      apiKey: "sk-test-secret-value",
      model: "gpt-5.5"
    });
    const request = fetchMock.mock.calls[0][1] as RequestInit;

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    expect((request.headers as Record<string, string>).Authorization).toBe("Bearer sk-test-secret-value");
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: "gpt-5.5",
      input: expect.stringContaining("Cloud Synthesis"),
      store: false
    });
    expect(event.status).toBe("complete");
    expect(event.outputPreview).toBe("Cloud synthesis complete.");
    expect(JSON.stringify(event.debug)).not.toContain("sk-test-secret-value");
    expect(JSON.stringify(event.artifacts)).not.toContain("sk-test-secret-value");
  });

  it("calls Anthropic Messages with the direct-browser header when enabled", async () => {
    const workflow = demoWorkflows[0];
    const node = workflow.nodes.find((candidate) => candidate.id === "planner");

    if (!node) {
      throw new Error("missing planner node");
    }

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          id: "msg_123",
          model: "claude-sonnet-4-5",
          content: [{ type: "text", text: "Plan ready." }],
          usage: { input_tokens: 30, output_tokens: 5 }
        }),
        { status: 200 }
      )
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const event = await runCloudLlmNode(workflow, node, 1, "run-1", {
      ...defaultLlmRuntimeConfig,
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "ant-secret-value-1234567890",
      model: "claude-sonnet-4-5",
      directBrowser: true
    });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = request.headers as Record<string, string>;

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
    expect(headers["x-api-key"]).toBe("ant-secret-value-1234567890");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: "claude-sonnet-4-5",
      messages: [{ role: "user", content: expect.stringContaining("Planning Agent") }]
    });
    expect(event.status).toBe("complete");
    expect(event.outputPreview).toBe("Plan ready.");
    expect(JSON.stringify(event.debug)).not.toContain("ant-secret-value-1234567890");
  });

  it("redacts provider error text before storing stderr artifacts", async () => {
    const workflow = demoWorkflows[1];
    const node = workflow.nodes.find((candidate) => candidate.id === "cloud");

    if (!node) {
      throw new Error("missing cloud node");
    }

    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            type: "auth_error",
            message: "bad key sk-test-secret-value"
          }
        }),
        { status: 401 }
      )
    ) as typeof fetch;

    const event = await runCloudLlmNode(workflow, node, 4, "run-1", {
      ...defaultLlmRuntimeConfig,
      apiKey: "sk-test-secret-value"
    });

    expect(event.status).toBe("failed");
    expect(event.debug?.stderr).toContain("[REDACTED]");
    expect(JSON.stringify(event)).not.toContain("sk-test-secret-value");
  });
});
