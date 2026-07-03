import { Download, FileJson, Play, RotateCcw, Square } from "lucide-react";
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
  onExport
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
        </div>
        <span className={`mode-badge mode-badge--${runMode}`}>
          {runMode === "demo" ? "Simulated trace / no execution" : "Live local / Ollama only"}
        </span>
        <button type="button" className="icon-button" onClick={onReplay} title="Replay latest run">
          <RotateCcw size={17} />
        </button>
        <button type="button" className="icon-button" onClick={onExport} title="Export workflow JSON">
          <FileJson size={17} />
        </button>
        <button type="button" className="icon-button" onClick={onExport} title="Download trace">
          <Download size={17} />
        </button>
        <button
          type="button"
          className={`run-button ${isRunning ? "is-running" : ""}`}
          onClick={isRunning ? onStop : onRun}
        >
          {isRunning ? <Square size={16} /> : <Play size={16} />}
          <span>{isRunning ? "Stop" : runMode === "demo" ? "Run demo trace" : "Run local Ollama"}</span>
        </button>
      </div>
    </header>
  );
}
