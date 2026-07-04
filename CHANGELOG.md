# Changelog

## 0.6.0 - Launch candidate

- Added loopback Runtime mode through the packaged CLI for local command nodes and MCP stdio/HTTP discovery.
- Added runtime API routes for status checks, local command execution, MCP initialize/tools-list, optional tools-call, and remote MCP probing.
- Added Runtime mode UI controls, Doctor runtime readiness, MCP live discovery buttons, and runtime trace artifacts.
- Added LangGraph and CrewAI starter exports plus a trace bundle manifest to replay-session exports.
- Added runtime client, adapter, bundle, and packaged CLI smoke coverage.

## 0.5.0 - Launch candidate

- Added GitHub Pages launch site under `docs/index.html`.
- Added launch detail copy, Phase 6 gate, social launch drafts, and screenshot inventory.
- Added reproducible launch screenshot capture via `npm run screenshots:launch`.
- Added launch screenshots for Start, BYOK LLM config, failed-step debugging, and artifacts.
- Added GitHub Pages launch files for publishing the `docs/` launch site.
- Refreshed public docs around Cloud BYOK, provider CORS, browser-direct security caveats, and package inclusion.

## 0.4.0 - 2026-07-04

- Added first-run Start inspector tab with direct paths into the Failure Replay Lab, trace, Doctor, and LLM setup.
- Added Cloud BYOK run mode for configured OpenAI/Anthropic model nodes while keeping non-model and unmatched steps clearly simulated.
- Added LLM provider/model dropdowns, editable base URL/model fields, session-only API key handling, and a key-forget action.
- Added browser-direct OpenAI Responses and Anthropic Messages runners with prompt/result artifacts and secret-free debug payloads.
- Preserved `cloud` run mode in replay-session imports without exporting API keys.
- Added regression coverage for provider error redaction and replay exports excluding API keys.

## 0.3.0 - 2026-07-04

- Added replay-session export/import for graph, trace, artifacts, costs, validation issues, replay attempts, selected evidence, and imported MCP metadata.
- Added the Doctor inspector tab for browser support, local/secure context, Ollama model readiness, MCP readiness, graph health, env-key config, and privacy checks.
- Added Playwright browser regressions for run, trace click, node click, failed-step replay, artifact inspection, cost view, replay-session import/export, MCP import, and graph validation.
- Added clean package smoke for packed install plus installed `agentdesk` CLI serve.
- Hardened redaction for camelCase secret keys, JSON-string artifacts, validation issues, imported MCP metadata, and debug tool-call config.
- Polished launch docs with a sharper README value prop, workflow-builder contrast, and Phase 5.5 launch gate checklist.

## 0.2.0 - 2026-07-04

- Added tabbed debugger inspector for Trace, Debug, Artifacts, Costs, Validation, and MCP import.
- Added trace-event clicks that highlight the corresponding graph node.
- Added node clicks that show the latest prompt, tool/model call, result, stdout, and stderr.
- Added simulated failed-step replay that appends a linked replay event without rerunning the whole workflow.
- Added provider/model cost breakdown rows and richer export `traceSummary` cost/artifact fields.
- Added artifact viewer support for JSON, markdown, simulated screenshot SVG previews, stdout, and stderr.
- Added structured graph validation issues for cycles, duplicate IDs, missing endpoints, missing edges, unreachable outputs, and dead-end non-output nodes.
- Kept Phase 5 scoped to debugger depth: non-Ollama MCP, cloud-provider, and local-tool steps remain simulated or metadata-only.
- Added tests for trace panel replay, graph issue scope, artifact counts, cost grouping, and Ollama debugger artifacts.

## 0.1.0 - 2026-07-03

- Added launch-ready GitHub metadata: CI workflow, issue templates, PR template, Node version files, and `npm run verify`.
- Added visual workflow canvas demos, including Failure Replay Lab.
- Added explicit `Demo` and `Ollama` run modes.
- Added browser-to-local-Ollama execution for Ollama model nodes only.
- Added MCP import examples for Claude Desktop and VS Code-style configs.
- Added MCP readiness labels, risk flags, inferred tool hints, and metadata-only discovery states.
- Added portable workflow export and trace summary.
- Added stronger secret/path redaction for MCP imports and workflow exports.
- Added packaged static CLI server with conservative security headers.
- Reworked UI palette from cream/green to blue, violet, cyan, teal, amber, and coral accents.
