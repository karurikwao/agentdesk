import type { AgentFlowNode, AgentWorkflow, TraceEvent } from "../types/workflow";
import { buildOllamaPrompt } from "./ollama";
import {
  getLlmProviderPreset,
  normalizeBaseUrl,
  summarizeLlmConfig,
  type LlmRuntimeConfig
} from "./llmConfig";

type OpenAiResponse = {
  id?: string;
  model?: string;
  output_text?: string;
  output?: unknown[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

type AnthropicResponse = {
  id?: string;
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
  };
};

export async function runCloudLlmNode(
  workflow: AgentWorkflow,
  node: AgentFlowNode,
  index: number,
  runId: string,
  config: LlmRuntimeConfig,
  options: { signal?: AbortSignal } = {}
): Promise<TraceEvent> {
  const provider = config.provider;
  const model = node.data.model ?? config.model;
  const prompt = buildOllamaPrompt(workflow, node);
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(options.signal?.reason);
  const timeout = globalThis.setTimeout(() => controller.abort(), node.data.timeoutMs ?? 30000);

  if (options.signal?.aborted) {
    controller.abort(options.signal.reason);
  } else {
    options.signal?.addEventListener("abort", abortFromParent, { once: true });
  }

  try {
    const result =
      provider === "openai"
        ? await callOpenAiResponses(prompt, model, config, controller.signal)
        : await callAnthropicMessages(prompt, model, config, controller.signal);

    const output = result.output.trim() || `${getLlmProviderPreset(provider).label} returned an empty response.`;
    const tokensIn = result.tokensIn ?? estimateTokens(prompt);
    const tokensOut = result.tokensOut ?? estimateTokens(output);

    return {
      id: `${workflow.id}-${node.id}-cloud-${Date.now()}-${index}`,
      runId,
      nodeId: node.id,
      nodeLabel: node.data.label,
      kind: node.data.kind,
      status: "complete",
      startedAt,
      durationMs: Math.round(performance.now() - started),
      provider,
      model: result.model ?? model,
      tokensIn,
      tokensOut,
      costUsd: 0,
      summary: `${node.data.label} ran with BYOK ${getLlmProviderPreset(provider).label} model ${result.model ?? model}.`,
      artifact: `${provider}://${model}/${workflow.id}/${node.id}`,
      artifacts: [
        {
          id: `${workflow.id}-${node.id}-${provider}-json-${Date.now()}`,
          name: `${node.data.label} ${provider} response`,
          type: "json",
          uri: `${provider}://${model}/${workflow.id}/${node.id}/response.json`,
          content: JSON.stringify(
            {
              provider,
              model: result.model ?? model,
              responseId: result.id,
              promptTokens: tokensIn,
              outputTokens: tokensOut,
              output
            },
            null,
            2
          )
        },
        {
          id: `${workflow.id}-${node.id}-${provider}-markdown-${Date.now()}`,
          name: `${node.data.label} cloud answer`,
          type: "markdown",
          uri: `${provider}://${model}/${workflow.id}/${node.id}/answer.md`,
          content: output
        }
      ],
      debug: {
        prompt,
        toolCall: JSON.stringify(summarizeLlmConfig({ ...config, model, apiKey: "" }), null, 2),
        result: output,
        stdout: `${node.data.label}: BYOK ${provider} request completed`
      },
      inputRef: `input://${workflow.id}/${node.id}`,
      outputRef: `output://${workflow.id}/${node.id}`,
      inputPreview: prompt,
      outputPreview: output
    };
  } catch (error) {
    const message = normalizeCloudError(error, provider);

    return {
      id: `${workflow.id}-${node.id}-cloud-failed-${Date.now()}-${index}`,
      runId,
      nodeId: node.id,
      nodeLabel: node.data.label,
      kind: node.data.kind,
      status: "failed",
      startedAt,
      durationMs: Math.round(performance.now() - started),
      provider,
      model,
      tokensIn: estimateTokens(prompt),
      tokensOut: 0,
      costUsd: 0,
      summary: `${node.data.label} could not complete the BYOK ${provider} request.`,
      artifacts: [
        {
          id: `${workflow.id}-${node.id}-${provider}-stderr-${Date.now()}`,
          name: `${node.data.label} ${provider} error`,
          type: "stderr",
          uri: `${provider}://${model}/${workflow.id}/${node.id}/stderr.log`,
          content: message
        }
      ],
      debug: {
        prompt,
        toolCall: JSON.stringify(summarizeLlmConfig({ ...config, model, apiKey: "" }), null, 2),
        result: `${node.data.label} could not complete the BYOK ${provider} request.`,
        stderr: message
      },
      inputRef: `input://${workflow.id}/${node.id}`,
      inputPreview: prompt,
      error: {
        code: "CLOUD_LLM_UNAVAILABLE",
        message
      }
    };
  } finally {
    globalThis.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromParent);
  }
}

async function callOpenAiResponses(
  prompt: string,
  model: string,
  config: LlmRuntimeConfig,
  signal: AbortSignal
) {
  const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey.trim()}`
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: config.maxOutputTokens,
      store: false
    }),
    signal
  });
  const payload = (await readJsonOrText(response)) as OpenAiResponse | string;

  if (!response.ok) {
    throw new Error(extractProviderError(payload) || `OpenAI returned HTTP ${response.status}`);
  }

  if (typeof payload === "string") {
    return {
      output: payload,
      model,
      tokensIn: estimateTokens(prompt),
      tokensOut: estimateTokens(payload)
    };
  }

  const output = payload.output_text ?? extractTextFromUnknown(payload.output) ?? "";

  return {
    id: payload.id,
    output,
    model: payload.model,
    tokensIn: payload.usage?.input_tokens,
    tokensOut: payload.usage?.output_tokens
  };
}

async function callAnthropicMessages(
  prompt: string,
  model: string,
  config: LlmRuntimeConfig,
  signal: AbortSignal
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": config.apiKey.trim(),
    "anthropic-version": "2023-06-01"
  };

  if (config.directBrowser) {
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }

  const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: config.maxOutputTokens,
      messages: [{ role: "user", content: prompt }]
    }),
    signal
  });
  const payload = (await readJsonOrText(response)) as AnthropicResponse | string;

  if (!response.ok) {
    throw new Error(extractProviderError(payload) || `Anthropic returned HTTP ${response.status}`);
  }

  if (typeof payload === "string") {
    return {
      output: payload,
      model,
      tokensIn: estimateTokens(prompt),
      tokensOut: estimateTokens(payload)
    };
  }

  const output = (payload.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n\n");

  return {
    id: payload.id,
    output,
    model: payload.model,
    tokensIn: payload.usage?.input_tokens,
    tokensOut: payload.usage?.output_tokens
  };
}

async function readJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    return "";
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractProviderError(payload: unknown) {
  if (typeof payload === "string") {
    return redactSecretText(payload);
  }

  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: string; type?: string; code?: string } }).error;
    const message = [error?.type, error?.code, error?.message].filter(Boolean).join(": ");
    return redactSecretText(message);
  }

  return "";
}

function normalizeCloudError(error: unknown, provider: string) {
  if (error instanceof Error && error.name === "AbortError") {
    return `${provider} request timed out or was cancelled.`;
  }

  if (error instanceof TypeError && /failed to fetch/i.test(error.message)) {
    return `${provider} request failed in the browser. Check provider CORS support, base URL, API key, or use a backend proxy.`;
  }

  return redactSecretText(error instanceof Error ? error.message : String(error));
}

function extractTextFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(extractTextFromUnknown).filter(Boolean).join("\n\n") || undefined;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") {
      return record.text;
    }
    if (typeof record.output_text === "string") {
      return record.output_text;
    }
    if (record.content) {
      return extractTextFromUnknown(record.content);
    }
  }

  return undefined;
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function redactSecretText(value: string) {
  return value
    .replace(/\bbearer\s+[A-Za-z0-9._-]{10,}\b/gi, "Bearer [REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, "[REDACTED]")
    .replace(/\b(ant-[A-Za-z0-9_-]{8,})\b/g, "[REDACTED]")
    .replace(/\b([A-Za-z0-9+/]{32,}={0,2})\b/g, "[REDACTED]");
}
