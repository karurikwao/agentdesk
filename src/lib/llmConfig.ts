import type { ProviderKind } from "../types/workflow";

export type CloudLlmProvider = Extract<ProviderKind, "openai" | "anthropic">;

export type LlmModelPreset = {
  id: string;
  label: string;
  description: string;
};

export type LlmProviderPreset = {
  id: CloudLlmProvider;
  label: string;
  apiKeyLabel: string;
  baseUrl: string;
  endpointLabel: string;
  docsUrl: string;
  warning: string;
  models: LlmModelPreset[];
};

export type LlmRuntimeConfig = {
  provider: CloudLlmProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  maxOutputTokens: number;
  directBrowser: boolean;
  updatedAt?: string;
};

export const llmProviderPresets: LlmProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI Responses",
    apiKeyLabel: "OpenAI API key",
    baseUrl: "https://api.openai.com/v1",
    endpointLabel: "POST /responses",
    docsUrl: "https://developers.openai.com/api/reference/resources/responses/methods/create",
    warning:
      "Browser-direct OpenAI calls may be blocked by CORS and expose the supplied key to this local tab. Prefer a backend proxy for production apps.",
    models: [
      {
        id: "gpt-5.5",
        label: "GPT-5.5",
        description: "Current reasoning-first default for high quality agent steps."
      },
      {
        id: "gpt-5.5-pro",
        label: "GPT-5.5 Pro",
        description: "Higher latency option for harder reasoning and review steps."
      },
      {
        id: "gpt-5.4-mini",
        label: "GPT-5.4 Mini",
        description: "Lower cost/latency option for quick workflow nodes."
      }
    ]
  },
  {
    id: "anthropic",
    label: "Anthropic Messages",
    apiKeyLabel: "Anthropic API key",
    baseUrl: "https://api.anthropic.com/v1",
    endpointLabel: "POST /messages",
    docsUrl: "https://docs.anthropic.com/en/api/messages",
    warning:
      "Anthropic browser calls use the provider's direct-browser header. Organization CORS settings may still block requests.",
    models: [
      {
        id: "claude-sonnet-4-5",
        label: "Claude Sonnet 4.5",
        description: "Balanced Claude model for agent planning and synthesis."
      },
      {
        id: "claude-opus-4-8",
        label: "Claude Opus 4.8",
        description: "Stronger Claude model for deeper debugging and review."
      },
      {
        id: "claude-opus-4-7",
        label: "Claude Opus 4.7",
        description: "Compatibility option for teams pinned to prior Opus behavior."
      }
    ]
  }
];

export const defaultLlmRuntimeConfig: LlmRuntimeConfig = {
  provider: "openai",
  model: llmProviderPresets[0].models[0].id,
  apiKey: "",
  baseUrl: llmProviderPresets[0].baseUrl,
  maxOutputTokens: 700,
  directBrowser: true
};

export function getLlmProviderPreset(provider: CloudLlmProvider) {
  return llmProviderPresets.find((preset) => preset.id === provider) ?? llmProviderPresets[0];
}

export function createConfigForProvider(
  current: LlmRuntimeConfig,
  provider: CloudLlmProvider
): LlmRuntimeConfig {
  const preset = getLlmProviderPreset(provider);

  return {
    ...current,
    provider,
    model: preset.models[0]?.id ?? current.model,
    baseUrl: preset.baseUrl,
    updatedAt: new Date().toISOString()
  };
}

export function isCloudLlmProvider(provider: ProviderKind | undefined): provider is CloudLlmProvider {
  return provider === "openai" || provider === "anthropic";
}

export function hasUsableCloudConfig(config: LlmRuntimeConfig, provider: ProviderKind | undefined) {
  return isCloudLlmProvider(provider) && config.provider === provider && config.apiKey.trim().length > 0;
}

export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function summarizeLlmConfig(config: LlmRuntimeConfig) {
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: normalizeBaseUrl(config.baseUrl),
    endpoint: getLlmProviderPreset(config.provider).endpointLabel,
    key: config.apiKey.trim() ? "session-only key present" : "no key configured",
    directBrowser: config.directBrowser
  };
}
