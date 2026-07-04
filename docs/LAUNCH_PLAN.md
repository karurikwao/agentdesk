# AgentDesk Launch Plan

## GitHub Repo Metadata

- Name: `agentdesk`
- Description: `Local visual debugger for AI agent runs: replay failures, inspect prompts/tools/results, and export redacted evidence.`
- Homepage: `https://agentdesk-clf.pages.dev/`
- Topics: `ai-agents`, `mcp`, `ollama`, `developer-tools`, `react-flow`, `agent-workflows`, `ai-debugging`, `local-first`, `llmops`, `mcp-client`, `workflow-debugger`

## Launch Threshold

- `npm run verify` passes.
- `npm pack --dry-run` includes README, license, security notes, built app, launch docs, scripts, and screenshot assets.
- README includes a failure replay GIF, quick start, current limits, why-star positioning, and MCP safety contract.
- Browser smoke covers demo run, trace-to-node selection, failed-step replay, artifact tabs, cost breakdown, graph health, MCP import redaction, and Ollama failure handling when Ollama is unavailable.

## Demo Script

1. Open AgentDesk; it lands on `Failure Replay Lab`.
2. Click `Run failure demo`.
3. Click the failed Browser Replay event to highlight the canvas node.
4. Show `Debug`, `Artifacts`, and `Costs`.
5. Click `Replay failed step` and show the appended replay event.
6. Export or import `docs/examples/failure-replay.agentdesk-session.json`.
7. After the wow moment, import `docs/examples/mcp-claude-desktop.json`.
8. Show readiness/risk flags and add MCP nodes.
9. Start the packaged CLI, choose `Runtime`, and run a local command node or discover imported MCP tools.
10. Switch to `Local Research Agent`, choose `Ollama`, and run against local Ollama if available.

## Known Limitations

- Local command and MCP execution require the packaged loopback CLI and Runtime mode.
- Remote MCP URLs are probed only after explicit Runtime mode discovery.
- Ollama live mode depends on a local Ollama runtime and browser-accessible CORS settings.
- Cloud BYOK mode executes only configured `provider: "openai"` and `provider: "anthropic"` model nodes.
- Static Cloudflare/GitHub Pages demos cannot spawn local processes.
- Provider CORS, browser policy, or organization settings may block browser-direct cloud requests.
- There is no persistent project storage yet.

## Public Launch Checklist

- Keep the README failure replay GIF and social card current.
- Confirm repo CI is passing on `main`.
- Create `v0.6.1` GitHub release.
- Verify package dry run.
- Publish npm package only after final name decision; `agentdesk` returned npm 404/unpublished on July 4, 2026.
- Seed five good first issues from `docs/GOOD_FIRST_ISSUES.md`.
- Enable GitHub Discussions before broad launch.

## First 5 Issues To Seed

- Official MCP SDK transport adapter.
- Persistent approved runtime profiles.
- Zip download for trace bundle files.
- LangGraph/CrewAI adapter examples.
- Keyboard-first node and trace navigation.

## Show HN Draft

Show HN: AgentDesk, a local visual debugger for AI agent workflows

I built AgentDesk because most agent workflow tools make the graph easy to draw but the failed run hard to explain. AgentDesk gives you a local graph canvas, click-linked traces, failed-step replay, prompt/tool/result inspection, artifact viewing, graph validation, MCP 2025-11-25 config import with redaction, local Ollama model-node execution, BYOK OpenAI/Anthropic model nodes, loopback Runtime mode for local tools/MCP discovery and tool calls, trace bundle manifests, LangGraph/CrewAI starter exports, cost summaries, and portable replay-session exports. Static hosted demos do not spawn local processes; live local/MCP execution requires the packaged CLI.

## HN Reply Notes

- AgentDesk is closer to a debugger than a workflow platform.
- Failed-step replay appends a replay event while preserving the original trace evidence.
- Local/MCP execution is intentionally loopback-only and explicit.
- Ollama live mode is local-only and opt-in.
- The next milestone is persistent approved runtime profiles and an official SDK transport adapter.
