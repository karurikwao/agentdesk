import { Archive, Download, Play, RotateCcw, Square, Upload } from "lucide-react";
import type { RunMode, RunStatus } from "../types/workflow";

type TopbarProps = {
  title: string;
  description: string;
  status: RunStatus;
  nodeCount: number;
  edgeCount: number;
  totalCost: number;
  runMode: RunMode;
  onRunModeChange: (mode: RunMode) => void;
  onRun: () => void;
  onStop: () => void;
  onReplay: () => void;
  onExport: () => void;
  onExportBundle: () => void;
  onImport: () => void;
};

export function Topbar({
  title,
  description,
  status,
  nodeCount,
  edgeCount,
  totalCost,
  runMode,
  onRunModeChange,
  onRun,
  onStop,
  onReplay,
  onExport,
  onExportBundle,
  onImport
}: TopbarProps) {
  const isRunning = status === "running";

  return (
    <header className="topbar">
      <div className="topbar__copy">
        <div className="product-line">Local visual debugger for AI agent workflows</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="topbar__metrics" aria-label="Workflow metrics">
        <span>{nodeCount} nodes</span>
        <span>{edgeCount} links</span>
        <span>${totalCost.toFixed(4)}</span>
      </div>
      <div className="topbar__actions">
        <div className="mode-switch" aria-label="Run mode">
          <button
            type="button"
            className={runMode === "demo" ? "is-active" : ""}
            onClick={() => onRunModeChange("demo")}
          >
            Demo
          </button>
          <button
            type="button"
            className={runMode === "ollama" ? "is-active" : ""}
            onClick={() => onRunModeChange("ollama")}
          >
            Ollama
          </button>
          <button
            type="button"
            className={runMode === "cloud" ? "is-active" : ""}
            onClick={() => onRunModeChange("cloud")}
          >
            Cloud
          </button>
          <button
            type="button"
            className={runMode === "runtime" ? "is-active" : ""}
            onClick={() => onRunModeChange("runtime")}
          >
            Runtime
          </button>
        </div>
        <span className={`mode-badge mode-badge--${runMode}`}>
          {runMode === "demo"
            ? "Simulated trace / no execution"
            : runMode === "ollama"
            ? "Live local / Ollama only"
            : runMode === "cloud"
              ? "BYOK cloud / model nodes only"
              : "Loopback runtime / tools + MCP"}
        </span>
        <button
          type="button"
          className="icon-button"
          onClick={onReplay}
          title="Replay latest run"
          aria-label="Replay latest run"
        >
          <RotateCcw size={17} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onImport}
          title="Import replay session"
          aria-label="Import replay session"
        >
          <Upload size={17} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onExport}
          title="Export replay session"
          aria-label="Export replay session"
        >
          <Download size={17} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onExportBundle}
          title="Download trace bundle ZIP"
          aria-label="Download trace bundle ZIP"
        >
          <Archive size={17} />
        </button>
        <button
          type="button"
          className={`run-button ${isRunning ? "is-running" : ""}`}
          onClick={isRunning ? onStop : onRun}
        >
          {isRunning ? <Square size={16} /> : <Play size={16} />}
          <span>
            {isRunning
              ? "Stop"
              : runMode === "demo"
              ? "Run demo trace"
              : runMode === "ollama"
              ? "Run local Ollama"
              : runMode === "cloud"
                ? "Run BYOK cloud"
                : "Run runtime"}
          </span>
        </button>
      </div>
    </header>
  );
}
