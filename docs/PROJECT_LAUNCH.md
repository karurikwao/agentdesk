# AgentDesk Project Launch

## One-Liner

AgentDesk is a local visual debugger for AI agent workflows: replay failed steps, inspect prompts/tool calls/results/artifacts, validate the graph, and export redacted evidence.

## Public URLs

- Live app: https://agentdesk-clf.pages.dev/
- GitHub repo: https://github.com/karurikwao/agentdesk
- GitHub Pages launch page: https://karurikwao.github.io/agentdesk/
- NPM package name: `agentdesk` (unpublished until final publish decision)

## Screenshots

| Moment | Asset |
| --- | --- |
| Start here + workflow canvas | `docs/assets/agentdesk-start-here.png` |
| BYOK LLM configuration | `docs/assets/agentdesk-llm-config.png` |
| Failed-step debugger | `docs/assets/agentdesk-failure-debug.png` |
| Artifact viewer | `docs/assets/agentdesk-artifacts.png` |
| README hero screenshot | `docs/assets/agentdesk-workflow-run.png` |

## What To Show In The First 30 Seconds

1. Open AgentDesk and point to the `Start` tab.
2. Load `Failure Replay Lab`.
3. Click `Run demo trace`.
4. Click the failed `Browser Replay` event and show the graph node highlight.
5. Click `Replay failed step`.
6. Open `Artifacts`, `Costs`, `Validation`, `Doctor`, `LLMs`, and `MCP`.
7. Export a `.agentdesk-session.json` replay session.

## What Makes It Different

- AgentDesk is for debugging and evidence, not production orchestration.
- Trace events and graph nodes are click-linked both ways.
- Failed-step replay preserves the original failed event instead of rewriting history.
- Artifacts are first-class: JSON, markdown, screenshot, stdout, and stderr.
- Graph validation catches cycles, missing edges, unreachable outputs, duplicate IDs, and dead ends.
- Ollama model nodes can run locally.
- OpenAI/Anthropic model nodes can run in Cloud BYOK mode with session-only keys.
- Runtime mode can run approved local command nodes and MCP stdio/HTTP discovery through the loopback CLI.
- MCP imports keep readiness/risk flags, secret redaction, and live discovered tool hints.

## Show HN Draft

Show HN: AgentDesk, a local visual debugger for AI agent workflows

I built AgentDesk because most agent workflow tools make the graph easy to draw but the failed run hard to explain. AgentDesk gives you a local graph canvas, click-linked traces, failed-step replay, prompt/tool/result inspection, artifact viewing, graph validation, MCP config import with redaction, local Ollama model-node execution, BYOK OpenAI/Anthropic model nodes, loopback Runtime mode for local tools/MCP discovery, framework starter exports, and portable replay-session exports.

It is intentionally closer to a debugger than a workflow builder. Static hosted demos do not spawn local processes; live local/MCP execution requires the packaged loopback CLI and Runtime mode. Browser-direct cloud calls are BYOK/session-only. Provider CORS, browser policy, or organization settings may block browser-direct OpenAI/Anthropic requests; production apps should use a backend proxy or hosted secret boundary. BYOK prompts and responses become trace/debug/artifact evidence, while API keys are excluded from exports.

## Product Hunt Copy

**Tagline:** Replay, inspect, and export AI agent workflow failures.

**Description:** AgentDesk is a local visual debugger for agent workflows. Run a demo trace, click from trace to graph, inspect prompts/tool calls/results/artifacts, replay failed steps, validate the graph, import MCP configs safely, run local Ollama model nodes, run local tools/MCP discovery through loopback Runtime mode, and configure session-only BYOK OpenAI/Anthropic model nodes. Browser-direct cloud calls may be blocked by provider CORS or organization policy, and production apps should use a backend proxy.

## X / LinkedIn Launch Post

AgentDesk is live.

It is a local visual debugger for AI agent workflows:

- replay failed steps
- click trace events to highlight graph nodes
- inspect prompts, tool calls, results, stdout/stderr, JSON, markdown, and screenshots
- validate graph health
- import MCP configs and discover live tools through Runtime mode
- run local Ollama nodes
- run approved local command nodes
- use session-only BYOK OpenAI/Anthropic model nodes
- export trace bundles and LangGraph/CrewAI starters
- export redacted replay sessions

Browser-direct cloud calls can be blocked by provider CORS/org policy, and prompts/responses become trace evidence. API keys are not exported.

Live demo: https://agentdesk-clf.pages.dev/
GitHub: https://github.com/karurikwao/agentdesk

## Launch Checklist

- [x] README explains the debugger positioning.
- [x] Launch page exists under `docs/index.html`.
- [x] Screenshots exist under `docs/assets`.
- [x] GitHub Pages is configured to publish `main` `/docs`.
- [x] CI runs typecheck, tests, build, browser regressions, package smoke, audit, and pack dry-run.
- [x] Cloudflare deployment is live.
- [x] Security notes mention BYOK browser-direct caveats.

## Known Limits To Say Out Loud

- GitHub Pages serves the static launch site from `main` `/docs`.
- Browser-direct OpenAI/Anthropic calls may be blocked by provider CORS or organization settings.
- Production apps should proxy cloud model calls through a backend secret boundary.
- BYOK prompts and responses are trace/debug/artifact evidence; API keys are not exported.
- Static hosted demos cannot spawn local processes; use the packaged CLI for Runtime mode.
- Shell commands stay blocked unless `AGENTDESK_ALLOW_SHELL=1` is set before CLI launch.
- Workflow execution is still linear/topological.
