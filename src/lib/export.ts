import type { AgentWorkflow, TraceEvent } from "../types/workflow";
import { createPortableWorkflow, createTraceSummary } from "./schema";

export function createWorkflowExport(workflow: AgentWorkflow, trace: TraceEvent[]) {
  return {
    schema: "agentdesk.workflow.v1",
    appVersion: "0.1.0",
    exportedAt: new Date().toISOString(),
    portableWorkflow: sanitize(createPortableWorkflow(workflow)),
    traceSummary: createTraceSummary(trace),
    workflow: sanitize(workflow),
    trace: sanitize(trace)
  };
}

export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function sanitize<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        isSensitiveKey(key) ? "[REDACTED]" : sanitize(entry)
      ])
    ) as T;
  }

  if (typeof value === "string") {
    return redactString(value) as T;
  }

  return value;
}

function isSensitiveKey(key: string) {
  return /(^|[-_\s.])(api[-_]?key|access[-_]?token|authorization|bearer|client[-_]?secret|cookie|jwt|password|secret|session|token|x-api-key|database_url)($|[-_\s.])/i.test(key);
}

function redactString(value: string) {
  const urlRedacted = redactPathPrefixes(redactUrlsInText(value));

  return urlRedacted
    .replace(/(api[-_]?key|access[-_]?token|client[-_]?secret|secret|token|password|x-api-key)(=|:)\s*[^,\s"']+/gi, "$1$2[REDACTED]")
    .replace(/\bbearer\s+[A-Za-z0-9._-]{10,}\b/gi, "Bearer [REDACTED]")
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{12,})\b/g, "[REDACTED]")
    .replace(/\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED]");
}

function redactUrlsInText(value: string) {
  return value.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, (match) => redactUrlIfPossible(match));
}

function redactUrlIfPossible(value: string) {
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.pathname = parsed.pathname
      .split("/")
      .map((segment, index, segments) => {
        const previous = segments[index - 1] ?? "";
        return isSensitiveKey(previous) || /^(gh[pousr]_|xox|sk-|eyJ)/i.test(segment)
          ? "[REDACTED]"
          : segment;
      })
      .join("/");
    parsed.search = parsed.search ? "?redacted_query=true" : "";
    parsed.hash = parsed.hash ? "#redacted" : "";
    return parsed.toString();
  } catch {
    return value;
  }
}

function redactPathPrefixes(value: string) {
  return value
    .replace(/[A-Z]:\\Users\\[^\\/]+/gi, "${userHome}")
    .replace(/\/Users\/[^/\s"']+/g, "${userHome}")
    .replace(/\/home\/[^/\s"']+/g, "${userHome}");
}
