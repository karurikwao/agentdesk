import { useState } from "react";
import { KeyRound, PlugZap, Plus, ShieldCheck } from "lucide-react";
import { parseMcpConfigReport, sampleMcpConfig, type McpImportReport } from "../lib/mcp";
import type { ImportedMcpServer } from "../types/workflow";

type McpPanelProps = {
  importedServers: ImportedMcpServer[];
  onImport: (servers: ImportedMcpServer[]) => void;
  onImportConfigText: (configText: string) => void;
  onDiscoverServer: (server: ImportedMcpServer) => void;
  onCreateNodes: () => void;
};

export function McpPanel({
  importedServers,
  onImport,
  onImportConfigText,
  onDiscoverServer,
  onCreateNodes
}: McpPanelProps) {
  const [input, setInput] = useState(sampleMcpConfig);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Pick<McpImportReport, "sourceFormat" | "warnings"> | null>(
    null
  );

  function handleImport() {
    try {
      const importReport = parseMcpConfigReport(input);
      setError(null);
      setReport({
        sourceFormat: importReport.sourceFormat,
        warnings: importReport.warnings
      });
      onImportConfigText(input);
      onImport(importReport.servers);
      setInput(importReport.redactedPreview);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Unable to parse MCP JSON.");
      setReport(null);
      onImport([]);
    }
  }

  return (
    <section className="mcp-panel" aria-label="MCP importer">
      <div className="mcp-panel__head">
        <div>
          <div className="section-label">MCP</div>
          <strong>Server import</strong>
        </div>
        <button type="button" className="icon-button" onClick={handleImport} title="Import MCP config">
          <PlugZap size={16} />
        </button>
      </div>
      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        spellCheck={false}
        aria-label="MCP configuration JSON"
      />
      {error ? <div className="mcp-error">{error}</div> : null}
      {report ? (
        <div className="mcp-import-report">
          <strong>{formatSource(report.sourceFormat)}</strong>
          <span>{report.warnings.length === 0 ? "No import warnings" : report.warnings.join(" ")}</span>
        </div>
      ) : null}
      <div className="mcp-server-list">
        {importedServers.map((server) => (
          <div className="mcp-server" key={server.id}>
            <div>
              <strong>{server.id}</strong>
              <small>
                {server.type}: {server.url ?? `${server.command} ${server.args.join(" ")}`}
              </small>
              <div className="mcp-server__chips">
                <span className={`readiness-chip readiness-chip--${server.readiness.level}`}>
                  <ShieldCheck size={12} />
                  {server.readiness.label}
                </span>
                <span>{server.capabilities.discovery}</span>
                {server.riskFlags.slice(0, 2).map((flag) => (
                  <span key={flag}>{flag}</span>
                ))}
              </div>
              <p>{server.readiness.detail}</p>
              {server.capabilities.tools.length > 0 ? (
                <small>Tools: {server.capabilities.tools.join(", ")}</small>
              ) : null}
              {server.runtime?.protocolVersion ? (
                <small>MCP {server.runtime.protocolVersion}</small>
              ) : null}
              {server.runtime?.toolDescriptors?.some((tool) => tool.outputSchema || tool.execution) ? (
                <small>Schema/execution metadata captured for discovered tools.</small>
              ) : null}
              {server.runtime?.message ? <small>{server.runtime.message}</small> : null}
            </div>
            <span title="Environment keys only, never secret values">
              <KeyRound size={14} />
              {server.envKeys.length + server.headerKeys.length}
            </span>
            <button
              type="button"
              className="secondary-button"
              onClick={() => onDiscoverServer(server)}
              disabled={server.readiness.level === "blocked"}
            >
              Discover
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="secondary-button"
        onClick={onCreateNodes}
        disabled={importedServers.length === 0}
      >
        <Plus size={15} />
        <span>Add MCP nodes</span>
      </button>
    </section>
  );
}

function formatSource(sourceFormat: McpImportReport["sourceFormat"]) {
  const labels: Record<McpImportReport["sourceFormat"], string> = {
    "claude-desktop": "Claude Desktop",
    vscode: "VS Code",
    "nested-mcp": "Nested MCP",
    "single-server": "Single server"
  };

  return labels[sourceFormat];
}
