import { describe, expect, it } from "vitest";
import type { AgentWorkflow } from "../types/workflow";
import { parseMcpConfig } from "./mcp";
import {
  DEFAULT_OLLAMA_ENDPOINT,
  createReadinessReport,
  type BrowserCapabilities,
  type BrowserSupportMetadata,
  type ReadinessCategory,
  type ReadinessReport
} from "./readiness";

const supportedBrowser: BrowserSupportMetadata = {
  fetch: true,
  abortController: true,
  blob: true,
  objectUrl: true,
  dom: true,
  download: true
};

const legacyCapabilities: BrowserCapabilities = {
  origin: "http://127.0.0.1:5173",
  isSecureContext: true,
  hasFetch: true,
  hasAbortController: true,
  hasBlob: true,
  hasFileReader: true,
  hasObjectUrl: true,
  hasDownloadAttribute: true
};

const localContext = {
  href: "http://127.0.0.1:5173/",
  protocol: "http:",
  hostname: "127.0.0.1",
  isSecureContext: true
};

describe("readiness doctor", () => {
  it("returns a ready report for a local metadata-only workflow", () => {
    const report = createReadinessReport({
      workflow: createWorkflow(),
      browser: supportedBrowser,
      context: localContext,
      generatedAt: "2026-07-03T12:00:00.000Z"
    });

    expect(report.generatedAt).toBe("2026-07-03T12:00:00.000Z");
    expect(report.level).toBe("ready");
    expect(report.summary).toMatchObject({
      total: 8,
      ready: 8,
      review: 0,
      blocked: 0
    });
    expect(report.totals).toMatchObject({
      pass: 8,
      review: 0,
      fail: 0
    });
    expect(report.privacyGuarantees).toContain("MCP and local tool execution require Runtime mode through the loopback CLI.");
    expect(getCheck(report, "context")).toMatchObject({
      level: "ready",
      label: "Local context ready"
    });
  });

  it("supports legacy browser capabilities and Ollama status metadata", () => {
    const report = createReadinessReport({
      workflow: createWorkflow({ ollamaModel: true }),
      runMode: "ollama",
      capabilities: legacyCapabilities,
      ollamaStatus: {
        level: "ready",
        label: "Reachable",
        detail: "Ollama is reachable.",
        models: ["llama3.2"]
      }
    });

    expect(getCheck(report, "context")).toMatchObject({
      level: "ready",
      label: "Local context ready"
    });
    expect(getCheck(report, "ollama")).toMatchObject({
      level: "ready",
      metadata: {
        models: ["llama3.2"],
        reachable: true
      }
    });
    expect(report.totals.pass).toBe(report.summary.ready);
  });

  it("reports a completed zero-model Ollama probe as missing models", () => {
    const report = createReadinessReport({
      workflow: createWorkflow({ ollamaModel: true }),
      runMode: "ollama",
      capabilities: legacyCapabilities,
      ollamaStatus: {
        level: "review",
        label: "No models",
        detail: "Ollama is reachable, but no installed models were returned.",
        models: [],
        checkedAt: "2026-07-03T12:00:00.000Z"
      }
    });

    expect(getCheck(report, "ollama")).toMatchObject({
      level: "review",
      label: "Ollama model missing",
      metadata: {
        reachable: true,
        missingModels: ["llama3.2"]
      }
    });
  });

  it("blocks missing browser APIs and insecure non-local contexts", () => {
    const report = createReadinessReport({
      workflow: createWorkflow(),
      browser: {
        ...supportedBrowser,
        fetch: false,
        objectUrl: false
      },
      context: {
        href: "http://example.com/",
        protocol: "http:",
        hostname: "example.com",
        isSecureContext: false
      }
    });

    expect(report.level).toBe("blocked");
    expect(getCheck(report, "browser")).toMatchObject({
      level: "blocked",
      label: "Browser support incomplete"
    });
    expect(getCheck(report, "browser").metadata.missing).toEqual(["fetch", "objectUrl"]);
    expect(getCheck(report, "context")).toMatchObject({
      level: "blocked",
      label: "Insecure non-local context"
    });
  });

  it("computes Ollama reachability metadata without probing the network", () => {
    const reachable = createReadinessReport({
      workflow: createWorkflow({ ollamaModel: true }),
      runMode: "ollama",
      browser: supportedBrowser,
      context: localContext,
      ollama: {
        endpoint: DEFAULT_OLLAMA_ENDPOINT,
        reachable: true,
        status: 200,
        model: "llama3.2",
        models: ["llama3.2"]
      }
    });
    const unknown = createReadinessReport({
      workflow: createWorkflow({ ollamaModel: true }),
      runMode: "ollama",
      browser: supportedBrowser,
      context: localContext
    });
    const unavailable = createReadinessReport({
      workflow: createWorkflow({ ollamaModel: true }),
      runMode: "ollama",
      browser: supportedBrowser,
      context: localContext,
      ollama: {
        reachable: false,
        error: "connection refused"
      }
    });

    expect(getCheck(reachable, "ollama")).toMatchObject({
      level: "ready",
      label: "Ollama reachable",
      metadata: {
        endpoint: DEFAULT_OLLAMA_ENDPOINT,
        endpointIsLocal: true,
        reachable: true,
        status: 200,
        model: "llama3.2"
      }
    });
    expect(getCheck(unknown, "ollama")).toMatchObject({
      level: "review",
      label: "Ollama not probed"
    });
    expect(getCheck(unavailable, "ollama")).toMatchObject({
      level: "blocked",
      label: "Ollama unavailable",
      detail: "connection refused"
    });
  });

  it("blocks non-local Ollama endpoints in both reachability and privacy checks", () => {
    const report = createReadinessReport({
      workflow: createWorkflow({ ollamaModel: true }),
      runMode: "ollama",
      browser: supportedBrowser,
      context: localContext,
      ollama: {
        endpoint: "https://models.example.com/api/generate?token=secret-value",
        reachable: true
      }
    });
    const serialized = JSON.stringify(report);

    expect(getCheck(report, "ollama")).toMatchObject({
      level: "blocked",
      label: "Ollama endpoint is not local"
    });
    expect(getCheck(report, "privacy")).toMatchObject({
      level: "blocked",
      label: "Local-only guarantee broken"
    });
    expect(serialized).toContain("?redacted_query=true");
    expect(serialized).not.toContain("secret-value");
  });

  it("summarizes imported MCP config readiness", () => {
    const reviewReport = createReadinessReport({
      workflow: createWorkflow(),
      browser: supportedBrowser,
      context: localContext,
      importedServers: parseMcpConfig(
        JSON.stringify({
          mcpServers: {
            browser: {
              command: "npx",
              args: ["@agentdesk/browser-mcp"],
              env: {
                BROWSER_PROFILE: "agentdesk"
              }
            }
          }
        })
      )
    });
    const blockedReport = createReadinessReport({
      workflow: createWorkflow(),
      browser: supportedBrowser,
      context: localContext,
      importedServers: parseMcpConfig(
        JSON.stringify({
          mcpServers: {
            disabled: {
              command: "npx",
              disabled: true
            }
          }
        })
      )
    });

    expect(getCheck(reviewReport, "mcp")).toMatchObject({
      level: "review",
      label: "MCP import needs review",
      metadata: {
        serverCount: 1,
        review: 1,
        blocked: 0,
        riskFlags: ["executes-local-code", "requires-secrets"],
        serverIds: ["browser"]
      }
    });
    expect(getCheck(blockedReport, "mcp")).toMatchObject({
      level: "blocked",
      label: "MCP import blocked",
      metadata: {
        blocked: 1,
        serverIds: ["disabled"]
      }
    });
  });

  it("includes structured graph issues in the report", () => {
    const workflow = createWorkflow({
      edges: [{ id: "bad", source: "trigger", target: "missing" }]
    });
    const report = createReadinessReport({
      workflow,
      browser: supportedBrowser,
      context: localContext
    });
    const graph = getCheck(report, "graph");

    expect(graph).toMatchObject({
      level: "blocked",
      label: "Graph has errors",
      metadata: {
        errorCount: 1
      }
    });
    expect(graph.metadata.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing-target",
          edgeId: "bad"
        })
      ])
    );
  });

  it("detects missing env-key style config without requiring raw secrets", () => {
    const workflow = createWorkflow({
      nodeConfig: {
        apiKeyEnv: "AGENTDESK_API_KEY",
        requiredEnvKey: "AGENTDESK_TRACE_TOKEN"
      }
    });
    const report = createReadinessReport({
      workflow,
      browser: supportedBrowser,
      context: localContext,
      env: {
        availableEnvKeys: ["AGENTDESK_API_KEY"]
      }
    });

    expect(getCheck(report, "env")).toMatchObject({
      level: "blocked",
      label: "Env-key config missing",
      metadata: {
        requiredEnvKeys: ["AGENTDESK_API_KEY", "AGENTDESK_TRACE_TOKEN"],
        missingEnvKeys: ["AGENTDESK_TRACE_TOKEN"],
        discoveredEnvKeys: ["AGENTDESK_API_KEY", "AGENTDESK_TRACE_TOKEN"]
      }
    });
  });

  it("flags direct sensitive node config while omitting secret values from the report", () => {
    const report = createReadinessReport({
      workflow: createWorkflow({
        nodeConfig: {
          apiKey: "sk-1234567890abcdef"
        }
      }),
      browser: supportedBrowser,
      context: localContext
    });
    const serialized = JSON.stringify(report);

    expect(getCheck(report, "privacy")).toMatchObject({
      level: "review",
      label: "Sensitive config values need review",
      metadata: {
        directSensitiveConfig: [
          {
            nodeId: "worker",
            nodeLabel: "Worker",
            key: "apiKey"
          }
        ]
      }
    });
    expect(serialized).toContain("apiKey");
    expect(serialized).not.toContain("sk-1234567890abcdef");
  });
});

function getCheck(report: ReadinessReport, category: ReadinessCategory) {
  const check = report.checks.find((candidate) => candidate.category === category);

  if (!check) {
    throw new Error(`Missing readiness check: ${category}`);
  }

  return check;
}

function createWorkflow(
  options: {
    ollamaModel?: boolean;
    nodeConfig?: Record<string, string | number | boolean>;
    edges?: AgentWorkflow["edges"];
  } = {}
): AgentWorkflow {
  return {
    id: "ready-workflow",
    name: "Ready Workflow",
    tagline: "Readiness test",
    description: "Workflow used by readiness doctor tests.",
    nodes: [
      {
        id: "trigger",
        type: "agentNode",
        position: { x: 0, y: 0 },
        data: {
          label: "Trigger",
          kind: "trigger",
          description: "Start"
        }
      },
      {
        id: "worker",
        type: "agentNode",
        position: { x: 180, y: 0 },
        data: {
          label: "Worker",
          kind: "model",
          provider: options.ollamaModel ? "ollama" : "local",
          model: options.ollamaModel ? "llama3.2" : undefined,
          description: "Do the work",
          config: options.nodeConfig
        }
      },
      {
        id: "output",
        type: "agentNode",
        position: { x: 360, y: 0 },
        data: {
          label: "Output",
          kind: "output",
          provider: "openai",
          description: "Simulated final response"
        }
      }
    ],
    edges: options.edges ?? [
      { id: "e-trigger-worker", source: "trigger", target: "worker" },
      { id: "e-worker-output", source: "worker", target: "output" }
    ]
  };
}
