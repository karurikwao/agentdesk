# Phase 5.5 Launch Gate

Phase 5.5 is a launch-readiness pass for AgentDesk as a local visual debugger, not a workflow-builder pitch. The gate is complete only when the product story, replay evidence, privacy posture, browser behavior, and package output all line up.

## Positioning Gate

- README opens with the 10-second value prop: replay the failure, inspect every prompt/tool/result, and export redacted evidence.
- README explicitly contrasts AgentDesk with workflow builders: AgentDesk is for local debugging and evidence; workflow builders are for production automation, scheduling, queues, secrets, and live integrations.
- Current limits stay visible: MCP/local-tool execution requires the packaged loopback Runtime mode, and Cloud BYOK executes only configured OpenAI/Anthropic model nodes.

## Replay Session Round-Trip

- Start from `Failure Replay Lab`.
- Run the demo trace and select the failed trace event.
- Confirm the selected trace event highlights the matching graph node.
- Replay the failed step and confirm the replay event is appended without deleting or rewriting the original failure evidence.
- Export the `.agentdesk-session.json` replay session and confirm the export includes `portableWorkflow`, `traceSummary`, original failure data, replay event data, artifacts, costs, validation issues, selected evidence, imported MCP metadata, and redacted debug payloads.
- Re-open or re-import the exported session when the session round-trip path is available, then confirm the graph, selected evidence, artifacts, costs, validation state, and replay link still match the exported run.

## Readiness Doctor

- Confirm Node.js 20.19.0 or newer is active.
- Confirm `npm install` has completed from a clean checkout.
- Confirm `npm run verify` passes: typecheck, tests, build, and moderate-or-higher audit.
- Confirm `npm run build` produces a fresh `dist` app.
- Confirm the packaged CLI can serve the built app locally with `node ./bin/agentdesk.mjs --port 5173`.
- Confirm the public screenshot assets in `docs/assets` still match the README and launch-page story.

## Privacy Pass

- Import both MCP examples in `docs/examples`.
- Import a local sample config containing fake secrets in env values, headers, URLs, args, and user path prefixes.
- Confirm display and export redact secret values while preserving safe key names, readiness labels, risk flags, and inferred tool hints.
- Confirm imported MCP commands are treated as untrusted metadata and are not executed automatically.
- Confirm exported traces do not leak private absolute paths, bearer tokens, API keys, session tokens, or header values.
- Confirm BYOK API keys are not written to localStorage, replay sessions, workflow exports, or debug payloads.
- Confirm launch copy says browser-direct cloud calls may be blocked by provider CORS or organization settings and are not a production secret boundary.

## Browser Tests

- Smoke the live app in a browser from a fresh load.
- Cover `Failure Replay Lab`: run trace, trace-to-node selection, node-to-latest-event inspection, failed-step replay, Artifacts, Costs, Validation, and export.
- Cover MCP import: paste Claude Desktop and VS Code examples, verify readiness/risk labels, add imported MCP nodes, and confirm redaction.
- Cover Ollama mode gracefully: when Ollama is unavailable, the UI should explain the local dependency instead of looking broken; when available, only Ollama model nodes execute live.
- Cover responsive basics at desktop and narrow mobile widths: canvas, inspector, trace panel, and README-linked screenshot should remain legible.

## Package Smoke

- Run `npm pack --dry-run --ignore-scripts --json`.
- Confirm the tarball preview includes `README.md`, `LICENSE`, `SECURITY.md`, `CHANGELOG.md`, `package.json`, `bin`, `dist`, `docs/assets`, and `docs/examples`.
- Confirm the `agentdesk` bin points to `./bin/agentdesk.mjs`.
- Confirm a fresh build plus CLI serve path works before publishing.
- Confirm package metadata still says what the product is: local visual debugger for replaying and inspecting AI agent workflows.

## Launch Decision

- Ship when every gate above is checked or has a documented exception.
- Hold launch if replay evidence is lossy, privacy redaction leaks sensitive values, browser smoke fails, or package smoke does not match the public README promise.
