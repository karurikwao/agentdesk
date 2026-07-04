import { afterEach, describe, expect, it, vi } from "vitest";
import { demoWorkflows } from "../data/workflows";
import { buildOllamaPrompt, runOllamaNode } from "./ollama";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ollama helpers", () => {
  it("builds a workflow-aware local prompt", () => {
    const workflow = demoWorkflows[1];
    const node = workflow.nodes.find((candidate) => candidate.id === "ollama");

    expect(node).toBeTruthy();
    const prompt = buildOllamaPrompt(workflow, node!);

    expect(prompt).toContain(workflow.name);
    expect(prompt).toContain(node!.data.label);
    expect(prompt).toContain("Return a concise debugging note");
  });

  it("calls local Ollama with stream disabled", async () => {
    const workflow = demoWorkflows[1];
    const node = workflow.nodes.find((candidate) => candidate.id === "ollama")!;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));

      expect(body.stream).toBe(false);
      expect(body.model).toBe("llama3.2");

      return new Response(
        JSON.stringify({
          model: "llama3.2",
          response: "Local result",
          prompt_eval_count: 10,
          eval_count: 5
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const event = await runOllamaNode(workflow, node, 0, "run-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/generate",
      expect.objectContaining({ method: "POST" })
    );
    expect(event.status).toBe("complete");
    expect(event.outputPreview).toBe("Local result");
    expect(event.tokensIn).toBe(10);
    expect(event.tokensOut).toBe(5);
    expect(event.model).toBe("llama3.2");
    expect(event.costUsd).toBe(0);
    expect(event.debug?.toolCall).toContain("127.0.0.1:11434");
    expect(event.artifacts?.map((artifact) => artifact.type)).toEqual(["json", "markdown"]);
  });

  it("returns a failed trace event when Ollama is unavailable", async () => {
    const workflow = demoWorkflows[1];
    const node = workflow.nodes.find((candidate) => candidate.id === "ollama")!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      })
    );

    const event = await runOllamaNode(workflow, node, 0, "run-1");

    expect(event.status).toBe("failed");
    expect(event.error?.code).toBe("OLLAMA_UNAVAILABLE");
    expect(event.error?.message).toContain("connection refused");
    expect(event.model).toBe("llama3.2");
    expect(event.debug?.stderr).toContain("connection refused");
    expect(event.artifacts?.[0]).toMatchObject({ type: "stderr" });
  });
});
