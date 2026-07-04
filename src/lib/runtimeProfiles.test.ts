import { describe, expect, it } from "vitest";
import { createRuntimeProfileDocument, loadRuntimeProfiles, saveRuntimeProfiles, summarizeRuntimeProfiles } from "./runtimeProfiles";
import type { AgentWorkflow, ImportedMcpServer } from "../types/workflow";

describe("runtime profiles", () => {
  it("stores approved runtime metadata without secret values", () => {
    const workflow: AgentWorkflow = {
      id: "profiles",
      name: "Profiles",
      tagline: "Profiles",
      description: "Runtime profiles",
      nodes: [
        {
          id: "local",
          type: "agentNode",
          position: { x: 0, y: 0 },
          data: {
            label: "Local Tool",
            kind: "tool",
            provider: "local",
            description: "Runs a command",
            config: {
              command: "node",
              argsJson: "[\"--version\"]",
              envKeys: "API_KEY, TOKEN"
            }
          }
        }
      ],
      edges: []
    };
    const servers: ImportedMcpServer[] = [
      {
        id: "browser",
        type: "stdio",
        command: "npx",
        args: ["@agentdesk/browser-mcp"],
        envKeys: ["BROWSER_TOKEN"],
        headerKeys: [],
        riskFlags: ["executes-local-code", "requires-secrets"],
        readiness: {
          level: "review",
          label: "Needs approval",
          detail: "Review before discovery."
        },
        capabilities: {
          tools: ["browser"],
          resources: [],
          prompts: [],
          discovery: "requires-approval"
        }
      }
    ];

    const document = createRuntimeProfileDocument(workflow, servers, new Date("2026-07-04T00:00:00Z"));
    const serialized = JSON.stringify(document);

    expect(document.schema).toBe("agentdesk.runtime-profiles.v1");
    expect(document.localCommands[0]).toMatchObject({
      command: "node",
      args: ["--version"],
      envKeys: ["API_KEY", "TOKEN"],
      approved: true,
      blocked: false
    });
    expect(document.mcpServers[0]).toMatchObject({
      serverId: "browser",
      envKeys: ["BROWSER_TOKEN"],
      approved: true,
      blocked: false
    });
    expect(serialized).not.toContain("secret-value");
    expect(serialized).not.toContain("sk-");
  });

  it("summarizes and round-trips profile storage", () => {
    const storage = new Map<string, string>();
    const document = createRuntimeProfileDocument(
      {
        id: "empty",
        name: "Empty",
        tagline: "Empty",
        description: "Empty",
        nodes: [],
        edges: []
      },
      [
        {
          id: "blocked",
          type: "unknown",
          command: "",
          args: [],
          envKeys: [],
          headerKeys: [],
          riskFlags: [],
          readiness: {
            level: "blocked",
            label: "Missing transport",
            detail: "Needs command or URL."
          },
          capabilities: {
            tools: [],
            resources: [],
            prompts: [],
            discovery: "metadata-only"
          }
        }
      ],
      new Date("2026-07-04T00:00:00Z")
    );

    saveRuntimeProfiles(document, {
      setItem: (key, value) => storage.set(key, value)
    });
    const loaded = loadRuntimeProfiles({
      getItem: (key) => storage.get(key) ?? null
    });

    expect(loaded).toEqual(document);
    expect(summarizeRuntimeProfiles(loaded)).toEqual({
      total: 1,
      approved: 0,
      blocked: 1
    });
  });
});
