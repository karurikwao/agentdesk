import { Activity, AlertTriangle, Check, Clock, Cpu, Sparkles } from "lucide-react";
import type { RunStatus, TraceEvent } from "../types/workflow";

type TracePanelProps = {
  status: RunStatus;
  events: TraceEvent[];
  activeNodeId?: string;
  selectedTraceEventId?: string;
  onEventSelect: (event: TraceEvent) => void;
  onReplayFailedStep: (event: TraceEvent) => void;
};

export function TracePanel({
  status,
  events,
  activeNodeId,
  selectedTraceEventId,
  onEventSelect,
  onReplayFailedStep
}: TracePanelProps) {
  const totalTokens = events.reduce((sum, event) => sum + event.tokensIn + event.tokensOut, 0);
  const totalDuration = events.reduce((sum, event) => sum + event.durationMs, 0);

  return (
    <aside className="trace-panel" aria-label="Run trace">
      <div className="trace-panel__header">
        <div>
          <div className="section-label">Trace</div>
          <strong>{statusLabel(status)}</strong>
        </div>
        <span className={`status-dot status-dot--${status}`} aria-hidden="true" />
      </div>

      <div className="trace-metrics">
        <div>
          <Clock size={15} />
          <span>{totalDuration} ms</span>
        </div>
        <div>
          <Cpu size={15} />
          <span>{totalTokens.toLocaleString()} tok</span>
        </div>
      </div>

      <div className="trace-list">
        {events.length === 0 ? (
          <div className="empty-state">
            <Sparkles size={18} />
            <span>Run a workflow to capture prompts, tools, costs, and artifacts.</span>
          </div>
        ) : (
          events.map((event) => (
            <article
              className={`trace-event ${
                event.nodeId === activeNodeId ? "is-active" : ""
              } ${event.id === selectedTraceEventId ? "is-selected" : ""}`}
              key={event.id}
              tabIndex={0}
              role="button"
              aria-label={`Inspect ${event.nodeLabel}`}
              onClick={() => onEventSelect(event)}
              onKeyDown={(keyboardEvent) => {
                if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                  keyboardEvent.preventDefault();
                  onEventSelect(event);
                }
              }}
            >
              <div className="trace-event__top">
                <span className="trace-event__icon">
                  {event.status === "failed" ? <AlertTriangle size={14} /> : <Check size={14} />}
                </span>
                <strong>{event.nodeLabel}</strong>
                <small>{event.durationMs}ms</small>
              </div>
              <p>{event.summary}</p>
              {event.replayOf ? <span className="replay-chip">Replay {event.replayAttempt ?? 1}</span> : null}
              {event.error ? <div className="trace-error">{event.error.message}</div> : null}
              {event.outputPreview ? (
                <div className="trace-preview">
                  <span>Output</span>
                  <p>{event.outputPreview}</p>
                </div>
              ) : null}
              {event.inputPreview ? (
                <details className="trace-details">
                  <summary>Input preview</summary>
                  <p>{event.inputPreview}</p>
                </details>
              ) : null}
              <div className="trace-event__meta">
                <span>{event.kind}</span>
                {event.provider ? <span>{event.provider}</span> : null}
                {event.model ? <span>{event.model}</span> : null}
                <span>${event.costUsd.toFixed(4)}</span>
              </div>
              {event.status === "failed" && event.nodeId !== "graph" ? (
                <button
                  type="button"
                  className="secondary-button trace-replay-button"
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    onReplayFailedStep(event);
                  }}
                >
                  Replay failed step
                </button>
              ) : null}
              {event.artifacts && event.artifacts.length > 0 ? (
                <div className="artifact-chips">
                  {event.artifacts.map((artifact) => (
                    <span key={artifact.id}>{artifact.type}</span>
                  ))}
                </div>
              ) : null}
              {event.artifact ? (
                <code className="artifact-link">{event.artifact}</code>
              ) : null}
            </article>
          ))
        )}
      </div>

      <div className="trace-panel__footer">
        <Activity size={15} />
        <span>Replayable local trace</span>
      </div>
    </aside>
  );
}

function statusLabel(status: RunStatus) {
  switch (status) {
    case "running":
      return "Running";
    case "complete":
      return "Complete";
    case "failed":
      return "Failed";
    case "paused":
      return "Paused";
    default:
      return "Idle";
  }
}
