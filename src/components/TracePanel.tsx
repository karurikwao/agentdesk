import { Activity, AlertTriangle, Check, Clock, Cpu, Sparkles } from "lucide-react";
import type { RunStatus, TraceEvent } from "../types/workflow";

type TracePanelProps = {
  status: RunStatus;
  events: TraceEvent[];
  activeNodeId?: string;
};

export function TracePanel({ status, events, activeNodeId }: TracePanelProps) {
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
              }`}
              key={event.id}
            >
              <div className="trace-event__top">
                <span className="trace-event__icon">
                  {event.status === "failed" ? <AlertTriangle size={14} /> : <Check size={14} />}
                </span>
                <strong>{event.nodeLabel}</strong>
                <small>{event.durationMs}ms</small>
              </div>
              <p>{event.summary}</p>
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
                <span>${event.costUsd.toFixed(4)}</span>
              </div>
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
