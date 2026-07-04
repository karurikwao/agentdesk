# AgentDesk

**A local visual debugger for AI agent runs: replay the failure, inspect every prompt/tool/result, and export clean evidence before you wire in live tools.**

[![CI](https://github.com/karurikwao/agentdesk/actions/workflows/ci.yml/badge.svg)](https://github.com/karurikwao/agentdesk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-violet)](./LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20%2B-cyan)](./package.json)

AgentDesk answers the 10-second question: **what actually happened inside this agent run, and can I replay or share the evidence?**

It gives developers a graph canvas, click-linked traces, node-level prompt/tool/result inspection, failed-step replay, artifact viewing, metadata-only MCP imports, safe redaction, local Ollama model-node execution, simulated OpenAI/Anthropic-style steps, and portable workflow exports.

[Live demo](https://agentdesk-clf.pages.dev/) | [Cloudflare Pages](https://agentdesk-clf.pages.dev/) | [GitHub repo](https://github.com/karurikwao/agentdesk)

![AgentDesk workflow canvas](./docs/assets/agentdesk-workflow-run.png)

## Why It Exists

Most workflow builders optimize for wiring boxes together and shipping automation. AgentDesk optimizes for the debugging loop before that: replay a run, click from trace to graph, inspect the exact prompt/tool/result payloads, review artifacts and cost, check graph health, and export redacted evidence.

Use it when you need to explain or reproduce an agent run locally. Use a workflow builder when you need production scheduling, hosted secrets, queues, branching operations, or live third-party tool execution.

## 10-Second Demo

1. Pick `Failure Replay Lab`.
2. Click `Run demo trace`.
3. Click the failed event to highlight its node and inspect prompt/tool/result.
4. Click `Replay failed step`.
5. Open `Artifacts`, `Costs`, `Validation`, and `Doctor`, then export the `.agentdesk-session.json` replay session.

## What Works Today

- Visual workflow canvas with four launch demos: Repo QA Swarm, Local Research Agent, MCP Tool Router, and Failure Replay Lab.
- Demo trace runner with active-node highlighting, trace-to-node selection, node-to-latest-event inspection, graph validation, cost/token summaries, simulated failures, whole-run replay, and failed-step replay.
- Debugger inspector tabs for Trace, Debug, Artifacts, Costs, Validation, Doctor, and MCP import.
- Artifact viewer for JSON, markdown, simulated screenshot SVG previews, stdout, and stderr captured from trace events.
- Graph health UI for cycles, missing endpoints, duplicate IDs, missing edges, unreachable outputs, and non-output dead ends.
- Live local Ollama mode for `provider: "ollama"` model nodes only.
- MCP config import for Claude-style `mcpServers`, VS Code-style `servers`, nested `mcp.servers`, remote server URLs, and single-server JSON.
- MCP metadata readiness, risk flags, inferred tool hints, and env/header key names without secret values.
- Replay-session import/export with `portableWorkflow`, `traceSummary`, full trace data, artifacts, costs, validation issues, selected evidence, imported MCP metadata, and secret/path redaction.
- Packaged static CLI via `agentdesk` after `npm run build`.

Imported MCP commands are **metadata-only** in this release. AgentDesk does not execute MCP stdio commands or probe remote MCP URLs automatically.
OpenAI, Anthropic, and other cloud-provider nodes are simulated in this release; live execution is limited to local Ollama model nodes.

## Quick Start

Prerequisite: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

### Guided Demo

1. Pick `Failure Replay Lab`.
2. Click `Run demo trace`.
3. Click the failed `Browser Replay` trace event to highlight its node and inspect prompt/tool/result.
4. Click `Replay failed step`, then open `Artifacts` and `Costs`.
5. Paste an example MCP config from [`docs/examples`](./docs/examples).
6. Export the `.agentdesk-session.json` replay session and import it again to restore the evidence.

### Optional Local Ollama Run

1. Start Ollama locally on `127.0.0.1:11434`.
2. Pull the demo model, for example `ollama pull llama3.2`.
3. Pick `Local Research Agent`.
4. Switch run mode from `Demo` to `Ollama`.
5. Click `Run local Ollama`.

Only Ollama model nodes are executed. All MCP and local tool nodes remain simulated metadata steps.
Cloud-provider model nodes remain simulated too, with trace entries marked as simulated during Ollama mode.

## MCP Import Examples

- [`docs/examples/mcp-claude-desktop.json`](./docs/examples/mcp-claude-desktop.json)
- [`docs/examples/mcp-vscode.json`](./docs/examples/mcp-vscode.json)

Secrets in env values, headers, URLs, args, private user path prefixes, and common token formats are redacted before display/export.

## Scripts

```bash
npm run dev        # start local Vite app on 127.0.0.1:5173
npm run build      # typecheck and build
npm run preview    # preview production build
npm run test       # run unit tests
npm run test:e2e:install # install Playwright Chromium
npm run test:e2e   # build and run browser regressions
npm run smoke:package # pack, install, and serve the CLI in a clean temp project
npm run lint       # run TypeScript checks
npm run verify     # typecheck, test, build, audit
npm pack --dry-run # verify package contents
```

## Packaged CLI

```bash
npm run build
node ./bin/agentdesk.mjs --port 5173
```

The CLI serves the built `dist` app from localhost with conservative static-server headers.

## Current Limits

- MCP command execution and true MCP tool discovery are intentionally not enabled yet.
- Ollama calls happen from the browser to `127.0.0.1:11434`; CORS settings may need adjustment in some local Ollama setups.
- Workflow execution is still linear/topological; advanced branching and joins are schema-ready but not fully interactive.
- Project storage is replay-session import/export only for now; there is no persistent workspace database.
- The README uses a current screenshot; an optional short GIF can replace it in a later promo pass.

## Roadmap

- Approval-gated Node-side MCP runner using the official MCP SDK.
- Real MCP initialize/list-tools discovery with timeout and process cleanup.
- Shareable multi-file trace bundle with screenshots and stdout/stderr artifacts.
- LangGraph/CrewAI export adapters.
- Hosted docs site and launch video.

## Security Notes

AgentDesk treats imported MCP configs and replay sessions as untrusted metadata. Exports redact common secrets and private paths, but local UI display is not a secret vault. Do not paste real secrets into node labels, prompts, stdout/stderr, artifacts, screenshots, or Ollama responses. See [SECURITY.md](./SECURITY.md).

## License

MIT
