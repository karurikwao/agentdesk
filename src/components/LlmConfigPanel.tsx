import { ExternalLink, KeyRound, RotateCcw, SlidersHorizontal, Wand2 } from "lucide-react";
import {
  createConfigForProvider,
  getLlmProviderPreset,
  llmProviderPresets,
  type CloudLlmProvider,
  type LlmRuntimeConfig
} from "../lib/llmConfig";
import type { RunMode } from "../types/workflow";

type LlmConfigPanelProps = {
  config: LlmRuntimeConfig;
  runMode: RunMode;
  cloudModelNodeCount: number;
  configuredCloudModelNodeCount: number;
  onChange: (config: LlmRuntimeConfig) => void;
  onRunModeChange: (mode: RunMode) => void;
  onForgetKey: () => void;
  onApplyToNodes: () => void;
};

export function LlmConfigPanel({
  config,
  runMode,
  cloudModelNodeCount,
  configuredCloudModelNodeCount,
  onChange,
  onRunModeChange,
  onForgetKey,
  onApplyToNodes
}: LlmConfigPanelProps) {
  const preset = getLlmProviderPreset(config.provider);
  const keyPresent = config.apiKey.trim().length > 0;
  const canRunConfiguredNodes = runMode === "cloud" && keyPresent && configuredCloudModelNodeCount > 0;

  function update(partial: Partial<LlmRuntimeConfig>) {
    onChange({ ...config, ...partial });
  }

  function changeProvider(provider: CloudLlmProvider) {
    onChange(createConfigForProvider(config, provider));
  }

  return (
    <section className="llm-config-panel panel-shell" aria-label="LLM configuration">
      <header className="llm-config-head">
        <div>
          <div className="section-label">LLMs</div>
          <strong>Bring your own key</strong>
          <span>{canRunConfiguredNodes ? "Ready for BYOK cloud model nodes" : "Session-only key setup"}</span>
        </div>
        <a href={preset.docsUrl} target="_blank" rel="noreferrer" title={`${preset.label} docs`}>
          <ExternalLink size={16} />
        </a>
      </header>

      <div className="llm-config-body">
        <div className={`llm-status ${canRunConfiguredNodes ? "llm-status--ready" : ""}`}>
          <KeyRound size={16} />
          <span>
            {keyPresent
              ? `${configuredCloudModelNodeCount}/${cloudModelNodeCount} cloud model node(s) match ${preset.label}.`
              : "Paste an API key to enable Cloud mode for matching model nodes."}
          </span>
        </div>

        <label className="llm-field">
          <span>Provider</span>
          <select
            value={config.provider}
            onChange={(event) => changeProvider(event.currentTarget.value as CloudLlmProvider)}
          >
            {llmProviderPresets.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>

        <label className="llm-field">
          <span>Model preset</span>
          <select value={config.model} onChange={(event) => update({ model: event.currentTarget.value })}>
            {preset.models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label} - {model.id}
              </option>
            ))}
          </select>
        </label>

        <label className="llm-field">
          <span>Custom model</span>
          <input
            value={config.model}
            spellCheck={false}
            onChange={(event) => update({ model: event.currentTarget.value })}
            placeholder="provider-model-id"
          />
        </label>

        <label className="llm-field">
          <span>{preset.apiKeyLabel}</span>
          <input
            type="password"
            value={config.apiKey}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => update({ apiKey: event.currentTarget.value })}
            placeholder={config.provider === "openai" ? "sk-..." : "ant-..."}
          />
        </label>

        <label className="llm-field">
          <span>Base URL</span>
          <input
            value={config.baseUrl}
            spellCheck={false}
            onChange={(event) => update({ baseUrl: event.currentTarget.value })}
          />
        </label>

        <div className="llm-grid">
          <label className="llm-field">
            <span>Max output</span>
            <input
              type="number"
              min={64}
              max={16000}
              step={64}
              value={config.maxOutputTokens}
              onChange={(event) =>
                update({ maxOutputTokens: Number.parseInt(event.currentTarget.value, 10) || 700 })
              }
            />
          </label>
          <label className="llm-toggle">
            <input
              type="checkbox"
              checked={config.directBrowser}
              onChange={(event) => update({ directBrowser: event.currentTarget.checked })}
            />
            <span>Browser direct</span>
          </label>
        </div>

        <div className="llm-config-actions">
          <button type="button" className="secondary-button" onClick={() => onRunModeChange("cloud")}>
            <SlidersHorizontal size={15} />
            <span>Use Cloud mode</span>
          </button>
          <button type="button" className="secondary-button" onClick={onApplyToNodes}>
            <Wand2 size={15} />
            <span>Apply to nodes</span>
          </button>
          <button type="button" className="secondary-button" onClick={onForgetKey} disabled={!keyPresent}>
            <RotateCcw size={15} />
            <span>Forget key</span>
          </button>
        </div>

        <div className="llm-warning">
          <strong>{preset.endpointLabel}</strong>
          <span>{preset.warning}</span>
          <small>Keys stay in React state for this tab and are not written to replay exports.</small>
        </div>
      </div>
    </section>
  );
}
