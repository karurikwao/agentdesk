import type { AgentFlowNode, AgentWorkflow, TraceEvent } from "../types/workflow";
import type { OllamaReadinessStatus } from "./readiness";

const OLLAMA_ENDPOINT = "http://127.0.0.1:11434/api/generate";
const OLLAMA_TAGS_ENDPOINT = "http://127.0.0.1:11434/api/tags";

type OllamaGenerateResponse = {
  response?: string;
  model?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
};

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
    model?: string;
  }>;
};

export async function checkOllamaStatus(
  options: { signal?: AbortSignal } = {}
): Promise<OllamaReadinessStatus> {
  try {
    const response = await fetch(OLLAMA_TAGS_ENDPOINT, {
      method: "GET",
      signal: options.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}`);
    }

    const payload = (await response.json()) as OllamaTagsResponse;
    const models = (payload.models ?? [])
      .map((model) => model.model ?? model.name)
      .filter((model): model is string => Boolean(model))
      .sort();

    return {
      level: models.length > 0 ? "ready" : "review",
      label: models.length > 0 ? "Reachable" : "No models",
      detail: models.length > 0
        ? `Ollama is reachable with ${models.length} installed model(s).`
        : "Ollama is reachable, but no installed models were returned.",
      models,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "The local Ollama readiness probe was cancelled."
        : error instanceof Error
          ? error.message
          : "Unable to reach Ollama.";

    return {
      level: "blocked",
      label: "Unavailable",
      detail: `Ollama probe failed: ${message}`,
      models: [],
      checkedAt: new Date().toISOString()
    };
  }
}

export function buildOllamaPrompt(workflow: AgentWorkflow, node: AgentFlowNode) {
  const template =
    node.data.promptTemplate ??
    "You are running inside AgentDesk. Explain the next safest step for this workflow.";

  return [
    template,
    "",
    `Workflow: ${workflow.name}`,
    `Node: ${node.data.label}`,
    `Goal: ${workflow.description}`,
    "",
    "Return a concise debugging note with risks, next tool call, and expected artifact."
  ].join("\n");
}

export async function runOllamaNode(
  workflow: AgentWorkflow,
  node: AgentFlowNode,
  index: number,
  runId: string,
  options: { signal?: AbortSignal } = {}
): Promise<TraceEvent> {
  const prompt = buildOllamaPrompt(workflow, node);
  const model = node.data.model ?? "llama3.2";
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(options.signal?.reason);
  const timeout = globalThis.setTimeout(() => controller.abort(), node.data.timeoutMs ?? 20000);

  if (options.signal?.aborted) {
    controller.abort(options.signal.reason);
  } else {
    options.signal?.addEventListener("abort", abortFromParent, { once: true });
  }

  try {
    const response = await fetch(OLLAMA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}`);
    }

    const payload = (await response.json()) as OllamaGenerateResponse;
    const output = payload.response?.trim() || "Ollama returned an empty response.";

    return {
      id: `${workflow.id}-${node.id}-${Date.now()}`,
      runId,
      nodeId: node.id,
      nodeLabel: node.data.label,
      kind: node.data.kind,
      status: "complete",
      startedAt,
      durationMs: Math.round(performance.now() - started),
      provider: "ollama",
      model: payload.model ?? model,
      tokensIn: payload.prompt_eval_count ?? estimateTokens(prompt),
      tokensOut: payload.eval_count ?? estimateTokens(output),
      costUsd: 0,
      summary: `${node.data.label} ran locally through Ollama model ${payload.model ?? model}.`,
      artifact: `ollama://${model}/${workflow.id}/${node.id}`,
      artifacts: [
        {
          id: `${workflow.id}-${node.id}-ollama-json`,
          name: `${node.data.label} Ollama response`,
          type: "json",
          uri: `ollama://${model}/${workflow.id}/${node.id}/response.json`,
          content: JSON.stringify(
            {
              model: payload.model ?? model,
              promptTokens: payload.prompt_eval_count ?? estimateTokens(prompt),
              outputTokens: payload.eval_count ?? estimateTokens(output),
              output
            },
            null,
            2
          )
        },
        {
          id: `${workflow.id}-${node.id}-ollama-markdown`,
          name: `${node.data.label} local answer`,
          type: "markdown",
          uri: `ollama://${model}/${workflow.id}/${node.id}/answer.md`,
          content: output
        }
      ],
      debug: {
        prompt,
        toolCall: JSON.stringify({ provider: "ollama", model, endpoint: "127.0.0.1:11434" }, null, 2),
        result: output,
        stdout: `${node.data.label}: local Ollama request completed`
      },
      inputRef: `input://${workflow.id}/${node.id}`,
      outputRef: `output://${workflow.id}/${node.id}`,
      inputPreview: prompt,
      outputPreview: output
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Ollama request timed out. Confirm Ollama is running on 127.0.0.1:11434 and the model is pulled."
        : error instanceof Error
          ? error.message
          : "Unable to reach Ollama.";

    return {
      id: `${workflow.id}-${node.id}-${Date.now()}`,
      runId,
      nodeId: node.id,
      nodeLabel: node.data.label,
      kind: node.data.kind,
      status: "failed",
      startedAt,
      durationMs: Math.round(performance.now() - started),
      provider: "ollama",
      model,
      tokensIn: estimateTokens(prompt),
      tokensOut: 0,
      costUsd: 0,
      summary: `${node.data.label} could not reach the local Ollama runtime.`,
      artifacts: [
        {
          id: `${workflow.id}-${node.id}-ollama-stderr`,
          name: `${node.data.label} Ollama error`,
          type: "stderr",
          uri: `ollama://${model}/${workflow.id}/${node.id}/stderr.log`,
          content: message
        }
      ],
      debug: {
        prompt,
        toolCall: JSON.stringify({ provider: "ollama", model, endpoint: "127.0.0.1:11434" }, null, 2),
        result: `${node.data.label} could not reach the local Ollama runtime.`,
        stderr: message
      },
      inputRef: `input://${workflow.id}/${node.id}`,
      inputPreview: prompt,
      error: {
        code: "OLLAMA_UNAVAILABLE",
        message
      }
    };
  } finally {
    globalThis.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromParent);
  }
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}
