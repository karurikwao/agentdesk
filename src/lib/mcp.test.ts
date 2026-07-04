import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseMcpConfig, parseMcpConfigReport, redactMcpConfigText } from "./mcp";

describe("parseMcpConfig", () => {
  it("imports Claude-style mcpServers without secret values", () => {
    const servers = parseMcpConfig(
      JSON.stringify({
        mcpServers: {
          browser: {
            command: "npx",
            args: ["-y", "@agentdesk/browser"],
            env: {
              API_KEY: "super-private-value"
            }
          }
        }
      })
    );

    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({
      id: "browser",
      type: "stdio",
      command: "npx",
      envKeys: ["API_KEY"]
    });
    expect(JSON.stringify(servers)).not.toContain("super-private-value");
    expect(servers[0].riskFlags).toContain("executes-local-code");
    expect(servers[0].riskFlags).toContain("requires-secrets");
    expect(servers[0].readiness.level).toBe("review");
    expect(servers[0].capabilities.discovery).toBe("requires-approval");
  });

  it("imports VS Code-style remote servers and redacts URL query strings", () => {
    const servers = parseMcpConfig(
      JSON.stringify({
        servers: {
          remote: {
            type: "http",
            url: "https://example.com/mcp?token=abc123",
            headers: {
              Authorization: "Bearer abc123"
            }
          }
        }
      })
    );

    expect(servers[0].type).toBe("http");
    expect(servers[0].url).toBe("https://example.com/mcp?redacted_query=true");
    expect(servers[0].headerKeys).toEqual(["Authorization"]);
    expect(JSON.stringify(servers)).not.toContain("abc123");
    expect(servers[0].readiness.level).toBe("review");
    expect(servers[0].readiness.label).toBe("Remote review");
    expect(servers[0].capabilities.discovery).toBe("remote-url");
  });

  it("rejects objects without server definitions", () => {
    expect(() => parseMcpConfig(JSON.stringify({ nope: true }))).toThrow(
      /Expected mcpServers/
    );
  });

  it("returns a normalized import report", () => {
    const report = parseMcpConfigReport(
      JSON.stringify({
        mcpServers: {
          ok: {
            command: "npx",
            args: ["pkg"]
          }
        },
        servers: {
          ignored: {
            url: "https://example.com"
          }
        }
      })
    );

    expect(report.sourceFormat).toBe("claude-desktop");
    expect(report.servers).toHaveLength(1);
    expect(report.warnings[0]).toContain("Multiple MCP server roots");
    expect(report.redactedPreview).toContain("mcpServers");
  });

  it("imports a later supported root when an earlier root is empty", () => {
    const report = parseMcpConfigReport(
      JSON.stringify({
        mcpServers: {},
        servers: {
          remote: {
            url: "https://example.com/mcp"
          }
        }
      })
    );

    expect(report.sourceFormat).toBe("vscode");
    expect(report.servers).toHaveLength(1);
    expect(report.warnings).toContain("Skipped an empty MCP server root.");
  });

  it("rejects array roots and skips malformed server entries", () => {
    expect(() => parseMcpConfig(JSON.stringify({ mcpServers: [] }))).toThrow(
      /Expected mcpServers/
    );

    const report = parseMcpConfigReport(
      JSON.stringify({
        mcpServers: {
          ok: {
            command: "npx"
          },
          malformed: ["npx"]
        }
      })
    );

    expect(report.servers.map((server) => server.id)).toEqual(["ok"]);
    expect(report.warnings).toContain("Skipped a malformed server entry.");
  });

  it("supports single-server JSON objects", () => {
    const stdio = parseMcpConfig(JSON.stringify({ command: "npx", args: ["pkg"] }));
    const remote = parseMcpConfig(JSON.stringify({ url: "https://example.com/mcp" }));

    expect(stdio[0]).toMatchObject({
      id: "imported-server",
      type: "stdio",
      command: "npx"
    });
    expect(remote[0]).toMatchObject({
      id: "imported-server",
      type: "http",
      readiness: {
        level: "review"
      }
    });
  });

  it("blocks empty MCP server metadata with no command or URL", () => {
    const [server] = parseMcpConfig(
      JSON.stringify({
        mcpServers: {
          empty: {}
        }
      })
    );

    expect(server).toMatchObject({
      id: "empty",
      type: "unknown",
      readiness: {
        level: "blocked",
        label: "Missing transport"
      }
    });
  });

  it("filters dangerous keys and redacts local command paths", () => {
    const report = parseMcpConfigReport(
      JSON.stringify({
        mcpServers: {
          safe: {
            command: "C:\\Users\\Ada\\bin\\server.exe",
            args: ["C:\\Users\\Ada\\workspace"]
          },
          ["__proto__"]: {
            command: "npx"
          }
        }
      })
    );

    expect(report.servers.map((server) => server.id)).toEqual(["safe"]);
    expect(report.servers[0].command).toBe("${userHome}\\bin\\server.exe");
    expect(report.servers[0].args).toContain("${userHome}\\workspace");
    expect(JSON.stringify(report)).not.toContain("Ada");
  });

  it("redacts common secret formats in args, urls, and pasted text", () => {
    const input = JSON.stringify({
      mcp: {
        servers: {
          risky: {
            command: "npx.cmd",
            args: ["--api-key", "ghp_1234567890abcdef", "--databaseUrl=postgres://user:pass@example.com/db", "--privateKey", "abc123"],
            url: "https://user:pass@example.com/mcp/sk-1234567890abcdef#access_token=abc",
            headers: {
              Authorization: "Bearer abc"
            }
          }
        }
      }
    });
    const [server] = parseMcpConfig(input);
    const scrubbedText = redactMcpConfigText(input);

    expect(server.command).toBe("npx.cmd");
    expect(server.args).toContain("[REDACTED]");
    expect(server.args.join(" ")).not.toContain("ghp_");
    expect(server.url).not.toContain("user:pass");
    expect(server.url).not.toContain("sk-");
    expect(server.url).toContain("#redacted");
    expect(server.riskFlags).toContain("executes-local-code");
    expect(scrubbedText).not.toContain("Bearer abc");
    expect(scrubbedText).not.toContain("user:pass");
    expect(scrubbedText).not.toContain("abc123");
  });

  it("parses checked-in MCP example fixtures", () => {
    const claudeFixture = readFileSync(
      new URL("../../docs/examples/mcp-claude-desktop.json", import.meta.url),
      "utf8"
    );
    const vscodeFixture = readFileSync(
      new URL("../../docs/examples/mcp-vscode.json", import.meta.url),
      "utf8"
    );

    const claudeReport = parseMcpConfigReport(claudeFixture);
    const vscodeReport = parseMcpConfigReport(vscodeFixture);
    const [remoteDocs] = vscodeReport.servers;

    expect(claudeReport.sourceFormat).toBe("claude-desktop");
    expect(claudeReport.servers.map((server) => server.id)).toEqual(["filesystem", "browser"]);
    expect(claudeReport.servers[0]).toMatchObject({
      type: "stdio",
      command: "npx",
      readiness: {
        level: "review"
      },
      capabilities: {
        discovery: "requires-approval"
      }
    });
    expect(claudeReport.servers[0].riskFlags).toContain("executes-local-code");
    expect(claudeReport.servers[1].envKeys).toEqual(["BROWSER_PROFILE"]);

    expect(vscodeReport.sourceFormat).toBe("vscode");
    expect(remoteDocs).toMatchObject({
      id: "remote-docs",
      type: "http",
      url: "https://example.com/mcp?redacted_query=true",
      headerKeys: ["Authorization"],
      readiness: {
        level: "review"
      },
      capabilities: {
        discovery: "remote-url"
      }
    });
    expect(JSON.stringify(vscodeReport)).not.toContain("replace-me");
  });
});
