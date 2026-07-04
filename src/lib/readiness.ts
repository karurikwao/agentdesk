import type { AgentWorkflow, GraphValidationIssue, ImportedMcpServer, RunMode } from "../types/workflow";
import { validateWorkflowGraph } from "./runEngine";

export const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434/api/generate";
export const DEFAULT_OLLAMA_TAGS_ENDPOINT = "http://127.0.0.1:11434/api/tags";

export type ReadinessLevel = "ready" | "review" | "blocked";

export type ReadinessCategory =
  | "browser"
  | "context"
  | "ollama"
  | "mcp"
  | "graph"
  | "env"
  | "privacy";

export type BrowserSupportMetadata = {
  fetch: boolean;
  abortController: boolean;
  blob: boolean;
  objectUrl: boolean;
  dom: boolean;
  download: boolean;
};

export type BrowserCapabilities = {
  origin: string;
  isSecureContext: boolean;
  hasFetch: boolean;
  hasAbortController: boolean;
  hasBlob: boolean;
  hasFileReader: boolean;
  hasObjectUrl: boolean;
  hasDownloadAttribute: boolean;
};

export type BrowserContextMetadata = {
  href?: string;
  protocol?: string;
  hostname?: string;
  isSecureContext?: boolean;
};

export type OllamaReadinessStatus = {
  level: "unchecked" | "ready" | "blocked" | "review";
  label: string;
  detail: string;
  models: string[];
  checkedAt?: string;
};

export type OllamaReachabilityMetadata = {
  endpoint?: string;
  reachable?: boolean;
  status?: number;
  statusText?: string;
  checkedAt?: string;
  error?: string;
  model?: string;
  models?: readonly string[];
};

export type EnvKeyMetadata = {
  requiredEnvKeys?: readonly string[];
  availableEnvKeys?: readonly string[];
  missingEnvKeys?: readonly string[];
};

export type ReadinessReportInput = {
  workflow: AgentWorkflow;
  graphIssues?: readonly GraphValidationIssue[];
  importedServers?: readonly ImportedMcpServer[];
  runMode?: RunMode;
  browser?: Partial<BrowserSupportMetadata>;
  capabilities?: Partial<BrowserCapabilities>;
  context?: BrowserContextMetadata;
  ollama?: OllamaReachabilityMetadata;
  ollamaStatus?: OllamaReadinessStatus;
  env?: EnvKeyMetadata;
  generatedAt?: string;
};

export type ReadinessCheck = {
  id: string;
  category: ReadinessCategory;
  level: ReadinessLevel;
  label: string;
  detail: string;
  remediation?: string;
  hints: string[];
  metadata: Record<string, unknown>;
};

export type ReadinessReport = {
  generatedAt: string;
  level: ReadinessLevel;
  summary: {
    total: number;
    ready: number;
    review: number;
    blocked: number;
  };
  totals: {
    pass: number;
    warn: number;
    fail: number;
    review: number;
  };
  checks: ReadinessCheck[];
  privacyGuarantees: string[];
};

type ConfigFinding = {
  nodeId: string;
  nodeLabel: string;
  key: string;
};

const levelRank: Record<ReadinessLevel, number> = {
  ready: 0,
  review: 1,
  blocked: 2
};

const requiredBrowserFeatures: (keyof BrowserSupportMetadata)[] = [
  "fetch",
  "abortController",
  "blob",
  "objectUrl",
  "dom",
  "download"
];

export const defaultOllamaStatus: OllamaReadinessStatus = {
  level: "unchecked",
  label: "Not checked",
  detail: `Click Check local Ollama to probe ${DEFAULT_OLLAMA_TAGS_ENDPOINT} from this browser.`,
  models: []
};

export function collectBrowserCapabilities(
  win: Window | undefined = typeof window === "undefined" ? undefined : window
): BrowserCapabilities {
  const origin = win?.location.origin ?? "";
  const anchor = win?.document.createElement("a");

  return {
    origin,
    isSecureContext: Boolean(
      win?.isSecureContext || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)
    ),
    hasFetch: typeof win?.fetch === "function",
    hasAbortController: Boolean(win && "AbortController" in win),
    hasBlob: Boolean(win && "Blob" in win),
    hasFileReader: Boolean(win && "FileReader" in win),
    hasObjectUrl: typeof URL !== "undefined" && typeof URL.createObjectURL === "function",
    hasDownloadAttribute: Boolean(anchor && "download" in anchor)
  };
}

export function createReadinessReport(input: ReadinessReportInput): ReadinessReport {
  const checks = createReadinessChecks(input);
  const privacyCheck = checks.find((check) => check.category === "privacy");

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    level: getWorstLevel(checks.map((check) => check.level)),
    summary: {
      total: checks.length,
      ready: checks.filter((check) => check.level === "ready").length,
      review: checks.filter((check) => check.level === "review").length,
      blocked: checks.filter((check) => check.level === "blocked").length
    },
    totals: {
      pass: checks.filter((check) => check.level === "ready").length,
      warn: 0,
      fail: checks.filter((check) => check.level === "blocked").length,
      review: checks.filter((check) => check.level === "review").length
    },
    checks,
    privacyGuarantees: Array.isArray(privacyCheck?.metadata.guarantees)
      ? privacyCheck.metadata.guarantees.map(String)
      : []
  };
}

export function createReadinessChecks(input: ReadinessReportInput): ReadinessCheck[] {
  const browser = normalizeBrowserSupport(input.browser, input.capabilities);
  const context = normalizeBrowserContext(input.context, input.capabilities);
  const graphIssues = [...(input.graphIssues ?? validateWorkflowGraph(input.workflow))];
  const importedServers = [...(input.importedServers ?? [])];
  const ollama = normalizeOllamaReachability(input.ollama, input.ollamaStatus);

  return [
    createBrowserCheck(browser),
    createContextCheck(context),
    createOllamaCheck(input, browser, ollama),
    createMcpCheck(importedServers),
    createGraphCheck(graphIssues),
    createEnvCheck(input),
    createPrivacyCheck(input, ollama)
  ];
}

export function detectBrowserSupport(): BrowserSupportMetadata {
  return {
    fetch: typeof fetch === "function",
    abortController: typeof AbortController === "function",
    blob: typeof Blob === "function",
    objectUrl: typeof URL !== "undefined" && typeof URL.createObjectURL === "function",
    dom: typeof document !== "undefined" && typeof document.createElement === "function",
    download:
      typeof document !== "undefined" &&
      typeof document.createElement === "function" &&
      "download" in document.createElement("a")
  };
}

export function detectBrowserContext(): BrowserContextMetadata {
  if (typeof window === "undefined") {
    return {};
  }

  return {
    href: window.location.href,
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    isSecureContext: window.isSecureContext
  };
}

function normalizeBrowserSupport(
  browser: Partial<BrowserSupportMetadata> | undefined,
  capabilities: Partial<BrowserCapabilities> | undefined
): BrowserSupportMetadata {
  const detected = detectBrowserSupport();

  return {
    fetch: browser?.fetch ?? capabilities?.hasFetch ?? detected.fetch,
    abortController: browser?.abortController ?? capabilities?.hasAbortController ?? detected.abortController,
    blob: browser?.blob ?? capabilities?.hasBlob ?? detected.blob,
    objectUrl: browser?.objectUrl ?? capabilities?.hasObjectUrl ?? detected.objectUrl,
    dom: browser?.dom ?? detected.dom,
    download: browser?.download ?? capabilities?.hasDownloadAttribute ?? detected.download
  };
}

function normalizeBrowserContext(
  context: BrowserContextMetadata | undefined,
  capabilities: Partial<BrowserCapabilities> | undefined
): BrowserContextMetadata {
  if (context) {
    return context;
  }

  if (capabilities?.origin) {
    try {
      const parsed = new URL(capabilities.origin);

      return {
        href: parsed.href,
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        isSecureContext: capabilities.isSecureContext
      };
    } catch {
      return {
        href: capabilities.origin,
        isSecureContext: capabilities.isSecureContext
      };
    }
  }

  return detectBrowserContext();
}

function normalizeOllamaReachability(
  ollama: OllamaReachabilityMetadata | undefined,
  ollamaStatus: OllamaReadinessStatus | undefined
): OllamaReachabilityMetadata {
  if (ollama) {
    return ollama;
  }

  if (!ollamaStatus) {
    return {};
  }

  return {
    endpoint: DEFAULT_OLLAMA_ENDPOINT,
    reachable:
      ollamaStatus.level === "ready"
        ? true
        : ollamaStatus.level === "blocked"
          ? false
          : ollamaStatus.checkedAt
            ? true
            : undefined,
    checkedAt: ollamaStatus.checkedAt,
    error: ollamaStatus.level === "blocked" ? ollamaStatus.detail : undefined,
    models: ollamaStatus.models
  };
}

function createBrowserCheck(browser: BrowserSupportMetadata): ReadinessCheck {
  const missing = requiredBrowserFeatures.filter((feature) => !browser[feature]);

  if (missing.length > 0) {
    return {
      id: "browser-support",
      category: "browser",
      level: "blocked",
      label: "Browser support incomplete",
      detail: `Missing required browser feature${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`,
      hints: [
        "Use a current Chromium, Firefox, or Safari browser.",
        "AgentDesk needs DOM, fetch, AbortController, Blob, object URL, and download support for local runs and exports."
      ],
      metadata: {
        browser,
        missing
      }
    };
  }

  return {
    id: "browser-support",
    category: "browser",
    level: "ready",
    label: "Browser support ready",
    detail: "Required browser APIs are available.",
    hints: [],
    metadata: {
      browser
    }
  };
}

function createContextCheck(context: BrowserContextMetadata): ReadinessCheck {
  const protocol = context.protocol ?? "";
  const hostname = normalizeHostname(context.hostname);
  const localOrigin = isLocalHostname(hostname);
  const secure = context.isSecureContext === true || protocol === "https:" || localOrigin;

  if (!protocol && !hostname && context.isSecureContext === undefined) {
    return {
      id: "secure-local-context",
      category: "context",
      level: "review",
      label: "Context unknown",
      detail: "Browser context metadata was not provided, so secure/local origin readiness could not be confirmed.",
      hints: ["Provide location protocol, hostname, and isSecureContext metadata when running the doctor outside a browser."],
      metadata: {
        context,
        localOrigin: false,
        secure: false
      }
    };
  }

  if (protocol === "file:") {
    return {
      id: "secure-local-context",
      category: "context",
      level: "review",
      label: "File context",
      detail: "The app is loaded from a file URL; some browser APIs and local network permissions can behave differently.",
      hints: ["Prefer the local Vite server on 127.0.0.1 for readiness checks and Ollama mode."],
      metadata: {
        context,
        localOrigin: true,
        secure
      }
    };
  }

  if (!secure || (protocol === "http:" && !localOrigin)) {
    return {
      id: "secure-local-context",
      category: "context",
      level: "blocked",
      label: "Insecure non-local context",
      detail: "AgentDesk should run on HTTPS or a loopback/local development origin.",
      hints: ["Use https://, http://localhost, http://127.0.0.1, or the configured Vite loopback host."],
      metadata: {
        context,
        localOrigin,
        secure
      }
    };
  }

  return {
    id: "secure-local-context",
    category: "context",
    level: "ready",
    label: localOrigin ? "Local context ready" : "Secure context ready",
    detail: localOrigin
      ? "The app is running from a loopback/local origin."
      : "The app is running from a secure HTTPS origin.",
    hints: [],
    metadata: {
      context,
      localOrigin,
      secure
    }
  };
}

function createOllamaCheck(
  input: ReadinessReportInput,
  browser: BrowserSupportMetadata,
  ollama: OllamaReachabilityMetadata
): ReadinessCheck {
  const endpoint = ollama.endpoint ?? DEFAULT_OLLAMA_ENDPOINT;
  const endpointIsLocal = isLocalUrl(endpoint);
  const ollamaNodes = input.workflow.nodes.filter(
    (node) => node.data.kind === "model" && node.data.provider === "ollama"
  );
  const requiredModels = unique(ollamaNodes.map((node) => node.data.model ?? "llama3.2")).sort();
  const installedModels = ollama.models ?? [];
  const missingModels = requiredModels.filter((model) => !installedModels.some((installed) => modelMatches(installed, model)));
  const liveRelevant = input.runMode === "ollama" || ollamaNodes.length > 0;
  const reachable = ollama.reachable;
  const metadata = {
    endpoint: redactUrlForMetadata(endpoint),
    endpointIsLocal,
    reachable: reachable ?? "unknown",
    status: ollama.status,
    statusText: ollama.statusText,
    checkedAt: ollama.checkedAt,
    error: ollama.error,
    model: ollama.model,
    models: ollama.models,
    requiredModels,
    missingModels,
    ollamaNodeCount: ollamaNodes.length,
    runMode: input.runMode ?? "demo"
  };

  if (!liveRelevant) {
    return {
      id: "ollama-reachability",
      category: "ollama",
      level: "ready",
      label: "Ollama not required",
      detail: "The selected workflow does not need live Ollama metadata.",
      hints: [],
      metadata
    };
  }

  if (!browser.fetch || !browser.abortController) {
    return {
      id: "ollama-reachability",
      category: "ollama",
      level: "blocked",
      label: "Ollama browser APIs missing",
      detail: "Ollama mode needs fetch and AbortController support in the browser.",
      hints: ["Use a browser with fetch and AbortController enabled."],
      metadata
    };
  }

  if (!endpointIsLocal) {
    return {
      id: "ollama-reachability",
      category: "ollama",
      level: "blocked",
      label: "Ollama endpoint is not local",
      detail: "Live Ollama mode is only allowed against a loopback/local endpoint.",
      hints: [`Use ${DEFAULT_OLLAMA_ENDPOINT} or another loopback Ollama URL.`],
      metadata
    };
  }

  if (reachable === true) {
    if (missingModels.length > 0) {
      return {
        id: "ollama-reachability",
        category: "ollama",
        level: "review",
        label: "Ollama model missing",
        detail: `Ollama is reachable, but missing model(s): ${missingModels.join(", ")}.`,
        hints: [`Run: ollama pull ${missingModels[0]}`],
        metadata
      };
    }

    return {
      id: "ollama-reachability",
      category: "ollama",
      level: "ready",
      label: "Ollama reachable",
      detail: "Reachability metadata says the local Ollama endpoint is reachable.",
      hints: [],
      metadata
    };
  }

  if (reachable === false) {
    return {
      id: "ollama-reachability",
      category: "ollama",
      level: "blocked",
      label: "Ollama unavailable",
      detail: ollama.error ?? "Reachability metadata says the local Ollama endpoint is unavailable.",
      hints: ["Start Ollama on 127.0.0.1:11434 and confirm the selected model is pulled."],
      metadata
    };
  }

  return {
    id: "ollama-reachability",
    category: "ollama",
    level: "review",
    label: "Ollama not probed",
    detail: "The workflow can use local Ollama mode, but no reachability result has been supplied.",
    hints: ["Start Ollama locally before running in Ollama mode."],
    metadata
  };
}

function createMcpCheck(importedServers: ImportedMcpServer[]): ReadinessCheck {
  const counts = countLevels(importedServers.map((server) => server.readiness.level));
  const remoteCount = importedServers.filter((server) => server.type === "http" || server.type === "sse").length;
  const riskFlags = unique(importedServers.flatMap((server) => server.riskFlags)).sort();
  const metadata = {
    serverCount: importedServers.length,
    ready: counts.ready,
    review: counts.review,
    blocked: counts.blocked,
    remoteCount,
    riskFlags,
    serverIds: importedServers.map((server) => server.id)
  };

  if (importedServers.length === 0) {
    return {
      id: "mcp-import-readiness",
      category: "mcp",
      level: "ready",
      label: "No MCP import",
      detail: "No imported MCP config is pending readiness review.",
      hints: [],
      metadata
    };
  }

  if (counts.blocked > 0) {
    return {
      id: "mcp-import-readiness",
      category: "mcp",
      level: "blocked",
      label: "MCP import blocked",
      detail: `${counts.blocked} imported MCP server${counts.blocked === 1 ? "" : "s"} cannot be assessed yet.`,
      hints: ["Fix disabled servers, missing stdio commands, or missing remote URLs before approval-based discovery."],
      metadata
    };
  }

  if (counts.review > 0 || remoteCount > 0 || riskFlags.length > 0) {
    return {
      id: "mcp-import-readiness",
      category: "mcp",
      level: "review",
      label: "MCP import needs review",
      detail: "Imported MCP metadata is usable for graphing, but execution or remote discovery still requires explicit approval.",
      hints: ["Review local commands, remote URLs, env/header key names, and risk flags before future MCP execution."],
      metadata
    };
  }

  return {
    id: "mcp-import-readiness",
    category: "mcp",
    level: "ready",
    label: "MCP metadata ready",
    detail: "Imported MCP server metadata is complete enough for graphing and export.",
    hints: [],
    metadata
  };
}

function createGraphCheck(issues: GraphValidationIssue[]): ReadinessCheck {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const metadata = {
    issueCount: issues.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    issues
  };

  if (errors.length > 0) {
    return {
      id: "graph-health",
      category: "graph",
      level: "blocked",
      label: "Graph has errors",
      detail: `${errors.length} graph error${errors.length === 1 ? "" : "s"} must be fixed before a run can start.`,
      hints: ["Fix cycles, duplicate IDs, missing edge endpoints, and self-loops before running."],
      metadata
    };
  }

  if (warnings.length > 0) {
    return {
      id: "graph-health",
      category: "graph",
      level: "review",
      label: "Graph has warnings",
      detail: `${warnings.length} graph warning${warnings.length === 1 ? "" : "s"} should be reviewed.`,
      hints: ["Review unreachable nodes, missing outputs, missing incoming edges, and dead ends."],
      metadata
    };
  }

  return {
    id: "graph-health",
    category: "graph",
    level: "ready",
    label: "Graph ready",
    detail: "The workflow graph has no validation issues.",
    hints: [],
    metadata
  };
}

function createEnvCheck(input: ReadinessReportInput): ReadinessCheck {
  const discovered = collectWorkflowEnvKeys(input.workflow);
  const required = unique([...(input.env?.requiredEnvKeys ?? []), ...discovered]);
  const available = input.env?.availableEnvKeys ? new Set(input.env.availableEnvKeys) : undefined;
  const missing = new Set(input.env?.missingEnvKeys ?? []);
  const emptySensitiveConfig = collectEmptySensitiveConfig(input.workflow);

  if (available) {
    for (const key of required) {
      if (!available.has(key)) {
        missing.add(key);
      }
    }
  }

  const metadata = {
    requiredEnvKeys: required,
    missingEnvKeys: [...missing].sort(),
    availableEnvKeyCount: input.env?.availableEnvKeys?.length,
    discoveredEnvKeys: discovered,
    emptySensitiveConfig
  };

  if (missing.size > 0 || emptySensitiveConfig.length > 0) {
    const missingText = [...missing].sort().join(", ");

    return {
      id: "env-key-config",
      category: "env",
      level: "blocked",
      label: "Env-key config missing",
      detail:
        missing.size > 0
          ? `Missing required env-key style config: ${missingText}.`
          : "Sensitive config slots are empty and should point to env-key names instead of raw values.",
      hints: ["Store secret material outside workflow JSON and reference env-key names only."],
      metadata
    };
  }

  if (required.length > 0 && !available) {
    return {
      id: "env-key-config",
      category: "env",
      level: "review",
      label: "Env-key config unverified",
      detail: `${required.length} env-key style config reference${required.length === 1 ? "" : "s"} were found but not checked against available keys.`,
      hints: ["Pass availableEnvKeys metadata to confirm local config before live adapters are added."],
      metadata
    };
  }

  return {
    id: "env-key-config",
    category: "env",
    level: "ready",
    label: "Env-key config ready",
    detail: required.length > 0
      ? "All referenced env-key style config values are present in the supplied metadata."
      : "No env-key style config is required for this workflow.",
    hints: [],
    metadata
  };
}

function createPrivacyCheck(input: ReadinessReportInput, ollama: OllamaReachabilityMetadata): ReadinessCheck {
  const endpoint = ollama.endpoint ?? DEFAULT_OLLAMA_ENDPOINT;
  const ollamaNodes = input.workflow.nodes.filter(
    (node) => node.data.kind === "model" && node.data.provider === "ollama"
  );
  const cloudProviderNodes = input.workflow.nodes.filter(
    (node) => node.data.provider === "openai" || node.data.provider === "anthropic"
  );
  const mcpNodes = input.workflow.nodes.filter((node) => node.data.provider === "mcp");
  const importedServers = [...(input.importedServers ?? [])];
  const remoteMcpServers = importedServers.filter((server) => server.type === "http" || server.type === "sse");
  const directSensitiveConfig = collectDirectSensitiveConfig(input.workflow);
  const endpointIsLocal = isLocalUrl(endpoint);
  const liveOllamaRelevant = input.runMode === "ollama" || ollamaNodes.length > 0;
  const guarantees = [
    "Live local execution is limited to Ollama model nodes on loopback endpoints.",
    "Cloud-provider execution is BYOK and limited to configured OpenAI/Anthropic model nodes.",
    "Imported MCP commands are metadata-only and are not executed.",
    "Remote MCP URLs are not probed by the doctor.",
    "The readiness report records env/header key names, not secret values.",
    "Replay exports redact common secret values and private user path prefixes."
  ];
  const metadata = {
    guarantees,
    endpoint: redactUrlForMetadata(endpoint),
    endpointIsLocal,
    ollamaNodeCount: ollamaNodes.length,
    cloudProviderNodeCount: cloudProviderNodes.length,
    mcpNodeCount: mcpNodes.length,
    importedMcpServerCount: importedServers.length,
    remoteMcpServerCount: remoteMcpServers.length,
    directSensitiveConfig
  };

  if (liveOllamaRelevant && !endpointIsLocal) {
    return {
      id: "local-privacy-guarantees",
      category: "privacy",
      level: "blocked",
      label: "Local-only guarantee broken",
      detail: "Live Ollama mode is configured with a non-local endpoint.",
      hints: [`Use ${DEFAULT_OLLAMA_ENDPOINT} or another loopback endpoint for live local model calls.`],
      metadata
    };
  }

  if (directSensitiveConfig.length > 0) {
    return {
      id: "local-privacy-guarantees",
      category: "privacy",
      level: "review",
      label: "Sensitive config values need review",
      detail: "Node config appears to contain direct sensitive values; only key names are included in this report.",
      hints: ["Replace raw secret values with env-key names such as OPENAI_API_KEY."],
      metadata
    };
  }

  return {
    id: "local-privacy-guarantees",
    category: "privacy",
    level: "ready",
    label: "Local/privacy guarantees ready",
    detail: "The current configuration preserves AgentDesk's local-only and metadata-only execution contract.",
    hints: [],
    metadata
  };
}

function collectWorkflowEnvKeys(workflow: AgentWorkflow) {
  const envKeys = new Set<string>();

  for (const node of workflow.nodes) {
    for (const [key, value] of Object.entries(node.data.config ?? {})) {
      if (isEnvReferenceKey(key) || isSensitiveConfigKey(key)) {
        for (const envKey of extractEnvKeys(value)) {
          envKeys.add(envKey);
        }
      }
    }
  }

  return [...envKeys].sort();
}

function collectEmptySensitiveConfig(workflow: AgentWorkflow): ConfigFinding[] {
  const findings: ConfigFinding[] = [];

  for (const node of workflow.nodes) {
    for (const [key, value] of Object.entries(node.data.config ?? {})) {
      if (isSensitiveConfigKey(key) && typeof value === "string" && value.trim() === "") {
        findings.push({
          nodeId: node.id,
          nodeLabel: node.data.label,
          key
        });
      }
    }
  }

  return findings;
}

function collectDirectSensitiveConfig(workflow: AgentWorkflow): ConfigFinding[] {
  const findings: ConfigFinding[] = [];

  for (const node of workflow.nodes) {
    for (const [key, value] of Object.entries(node.data.config ?? {})) {
      if (!isSensitiveConfigKey(key) || typeof value !== "string") {
        continue;
      }

      const trimmed = value.trim();
      if (!trimmed || extractEnvKeys(trimmed).length > 0 || isPlaceholderValue(trimmed)) {
        continue;
      }

      findings.push({
        nodeId: node.id,
        nodeLabel: node.data.label,
        key
      });
    }
  }

  return findings;
}

function extractEnvKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return unique(value.flatMap((entry) => extractEnvKeys(entry)));
  }

  if (typeof value !== "string") {
    return [];
  }

  return unique(
    [...value.matchAll(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g)]
      .map(([match]) => match)
      .filter((match) => !isPlaceholderValue(match))
  );
}

function isEnvReferenceKey(key: string) {
  const normalized = key.toLowerCase().replace(/[-_\s.]/g, "");

  return (
    normalized === "env" ||
    normalized === "envkey" ||
    normalized === "envkeys" ||
    normalized === "requiredenv" ||
    normalized === "requiredenvkey" ||
    normalized === "requiredenvkeys" ||
    normalized.endsWith("env") ||
    normalized.endsWith("envkey") ||
    normalized.endsWith("envkeys") ||
    normalized.endsWith("envvar") ||
    normalized.endsWith("envvars")
  );
}

function isSensitiveConfigKey(key: string) {
  return /(^|[-_\s.])(api[-_]?key|access[-_]?token|authorization|bearer|client[-_]?secret|cookie|jwt|password|secret|session|token|x-api-key|database_url)($|[-_\s.])/i.test(
    key
  );
}

function isPlaceholderValue(value: string) {
  return /^\[?redacted\]?$/i.test(value) || /^<[^>]+>$/.test(value) || /^(replace-me|todo|example)$/i.test(value);
}

function countLevels(levels: ReadinessLevel[]) {
  return {
    ready: levels.filter((level) => level === "ready").length,
    review: levels.filter((level) => level === "review").length,
    blocked: levels.filter((level) => level === "blocked").length
  };
}

function getWorstLevel(levels: ReadinessLevel[]): ReadinessLevel {
  return levels.reduce(
    (worst, level) => (levelRank[level] > levelRank[worst] ? level : worst),
    "ready" as ReadinessLevel
  );
}

function isLocalUrl(value: string) {
  try {
    const parsed = new URL(value);
    return isLocalHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function isLocalHostname(value: string | undefined) {
  const hostname = normalizeHostname(value);

  return hostname === "localhost" || hostname === "0.0.0.0" || hostname === "::1" || hostname.startsWith("127.");
}

function normalizeHostname(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "");
}

function redactUrlForMetadata(value: string) {
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.search = parsed.search ? "?redacted_query=true" : "";
    parsed.hash = parsed.hash ? "#redacted" : "";
    return parsed.toString();
  } catch {
    return value.replace(
      /(api[-_]?key|access[-_]?token|client[-_]?secret|secret|token|password|x-api-key)(=|:)\s*[^,\s"']+/gi,
      "$1$2[REDACTED]"
    );
  }
}

function modelMatches(installed: string, required: string) {
  return installed === required || installed === `${required}:latest` || installed.split(":")[0] === required;
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}
