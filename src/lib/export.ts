import type { AgentWorkflow, TraceEvent } from "../types/workflow";
import { createCrewAiExport, createLangGraphExport, createTraceBundle } from "./exportAdapters";
import { createPortableWorkflow, createTraceSummary } from "./schema";

export function createWorkflowExport(workflow: AgentWorkflow, trace: TraceEvent[]) {
  return {
    schema: "agentdesk.workflow.v1",
    appVersion: "0.7.0",
    exportedAt: new Date().toISOString(),
    portableWorkflow: sanitizeExportPayload(createPortableWorkflow(workflow)),
    traceSummary: sanitizeExportPayload(createTraceSummary(trace)),
    traceBundle: sanitizeExportPayload(createTraceBundle(workflow, trace)),
    adapters: sanitizeExportPayload({
      langGraph: createLangGraphExport(workflow),
      crewAi: createCrewAiExport(workflow)
    }),
    workflow: sanitizeExportPayload(workflow),
    trace: sanitizeExportPayload(trace)
  };
}

export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  downloadBlob(filename, blob);
}

export function downloadTraceBundleZip(workflow: AgentWorkflow, trace: TraceEvent[]) {
  const bundle = createTraceBundle(workflow, trace);
  const blob = createZipBlob(
    bundle.files.map((file) => ({
      path: file.path,
      content: file.content
    }))
  );

  downloadBlob(`${workflow.id}.trace-bundle.zip`, blob);
}

export function createZipBlob(files: Array<{ path: string; content: string }>) {
  const encoder = new TextEncoder();
  const now = new Date();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const path = sanitizeZipPath(file.path);
    const nameBytes = encoder.encode(path);
    const contentBytes = encoder.encode(file.content);
    const crc = crc32(contentBytes);
    const localHeader = createLocalFileHeader(nameBytes, contentBytes.length, crc, now);
    const centralHeader = createCentralDirectoryHeader(nameBytes, contentBytes.length, crc, now, offset);

    localParts.push(localHeader, contentBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + contentBytes.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = createEndOfCentralDirectory(files.length, centralSize, centralOffset);

  return new Blob([concatBytes([...localParts, ...centralParts, end])], {
    type: "application/zip"
  });
}

export function sanitizeZipPath(path: string) {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, "-"))
    .join("/")
    .replace(/^\/+/, "") || "artifact";
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createLocalFileHeader(nameBytes: Uint8Array, size: number, crc: number, date: Date) {
  const buffer = new ArrayBuffer(30 + nameBytes.length);
  const view = new DataView(buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, dosTime(date), true);
  view.setUint16(12, dosDate(date), true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  new Uint8Array(buffer).set(nameBytes, 30);
  return new Uint8Array(buffer);
}

function createCentralDirectoryHeader(
  nameBytes: Uint8Array,
  size: number,
  crc: number,
  date: Date,
  localOffset: number
) {
  const buffer = new ArrayBuffer(46 + nameBytes.length);
  const view = new DataView(buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, dosTime(date), true);
  view.setUint16(14, dosDate(date), true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint32(42, localOffset, true);
  new Uint8Array(buffer).set(nameBytes, 46);
  return new Uint8Array(buffer);
}

function createEndOfCentralDirectory(fileCount: number, centralSize: number, centralOffset: number) {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return new Uint8Array(buffer);
}

function concatBytes(parts: Uint8Array[]): ArrayBuffer {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }

  return bytes.buffer as ArrayBuffer;
}

function dosTime(date: Date) {
  return (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
}

function dosDate(date: Date) {
  return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

export function sanitizeExportPayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeExportPayload(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        isSensitiveKey(key) ? "[REDACTED]" : sanitizeExportPayload(entry)
      ])
    ) as T;
  }

  if (typeof value === "string") {
    return redactString(value) as T;
  }

  return value;
}

function isSensitiveKey(key: string) {
  return /api[-_\s]?key|apikey|access[-_\s]?token|refresh[-_\s]?token|authorization|bearer|client[-_\s]?secret|cookie|jwt|password|private[-_\s]?key|secret|session|token|x[-_\s]?api[-_\s]?key|database[-_\s]?url|databaseurl/i.test(key);
}

function redactString(value: string) {
  const urlRedacted = redactPathPrefixes(redactUrlsInText(value));

  return urlRedacted
    .replace(
      /("(?:api[-_]?key|apikey|openaiApiKey|anthropicApiKey|access[-_]?token|refresh[-_]?token|client[-_]?secret|private[-_]?key|secret|token|password|x-api-key|xApiKey|databaseUrl|database_url)"\s*:\s*")[^"]+(")/gi,
      "$1[REDACTED]$2"
    )
    .replace(
      /('(?:api[-_]?key|apikey|openaiApiKey|anthropicApiKey|access[-_]?token|refresh[-_]?token|client[-_]?secret|private[-_]?key|secret|token|password|x-api-key|xApiKey|databaseUrl|database_url)'\s*:\s*')[^']+(')/gi,
      "$1[REDACTED]$2"
    )
    .replace(/(api[-_]?key|apikey|openaiApiKey|anthropicApiKey|access[-_]?token|refresh[-_]?token|client[-_]?secret|private[-_]?key|secret|token|password|x-api-key|xApiKey|databaseUrl|database_url)(=|:)\s*[^,\s"']+/gi, "$1$2[REDACTED]")
    .replace(/\bbearer\s+[A-Za-z0-9._-]{10,}\b/gi, "Bearer [REDACTED]")
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{12,})\b/g, "[REDACTED]")
    .replace(/\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED]")
    .replace(/\b([A-Za-z0-9+/]{32,}={0,2})\b/g, "[REDACTED]")
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
    .replace(/[A-Z]:\\+Users\\+[^\\/"'\s]+/gi, "${userHome}")
    .replace(/[A-Z]:\\Users\\[^\\/]+/gi, "${userHome}")
    .replace(/\/Users\/[^/\s"']+/g, "${userHome}")
    .replace(/\/home\/[^/\s"']+/g, "${userHome}");
}
