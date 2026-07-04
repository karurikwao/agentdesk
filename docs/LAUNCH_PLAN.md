# AgentDesk Launch Plan

## GitHub Repo Metadata

- Name: `agentdesk`
- Description: `Local visual debugger for AI agent workflows across MCP, local runtime tools, Ollama, and session-only BYOK cloud model nodes.`
- Topics: `ai-agents`, `mcp`, `ollama`, `developer-tools`, `react-flow`, `agent-workflows`

## Launch Threshold

- `npm run verify` passes.
- `npm pack --dry-run` includes README, license, security notes, built app, launch docs, scripts, and screenshot assets.
- README includes screenshot/GIF, quick start, current limits, and MCP safety contract.
- Browser smoke covers demo run, trace-to-node selection, failed-step replay, artifact tabs, cost breakdown, graph health, MCP import redaction, and Ollama failure handling when Ollama is unavailable.

## Demo Script

1. Open AgentDesk.
2. Pick `Failure Replay Lab`.
3. Click `Run demo trace`.
4. Click the failed browser step to highlight the canvas node and inspect prompt/tool/result.
5. Click `Replay failed step` and show the appended replay event.
6. Open `Artifacts`, `Costs`, and `Validation`.
7. Import `docs/examples/mcp-claude-desktop.json`.
8. Show readiness/risk flags and add MCP nodes.
9. Start the packaged CLI, choose `Runtime`, and run a local command node or discover imported MCP tools.
10. Switch to `Local Research Agent`, choose `Ollama`, and run against local Ollama if available.
11. Export the `.agentdesk-session.json` replay session and point out `portableWorkflow`, `traceSummary`, `traceBundle`, LangGraph/CrewAI adapters, artifacts, costs, validation issues, and selected evidence.

## Known Limitations

- Local command and MCP execution require the packaged loopback CLI and Runtime mode.
- Remote MCP URLs are probed only after explicit Runtime mode discovery.
- Ollama live mode depends on a local Ollama runtime and browser-accessible CORS settings.
- Cloud BYOK mode executes only configured `provider: "openai"` and `provider: "anthropic"` model nodes.
- Static Cloudflare/GitHub Pages demos cannot spawn local processes.
- Provider CORS, browser policy, or organization settings may block browser-direct cloud requests.
- There is no persistent project storage yet.

## Public Launch Checklist

- Keep the current README screenshot or replace it with a 10-second GIF.
- Confirm repo CI is passing on `main`.
- Create `v0.6.0` GitHub release.
- Verify package dry run.
- Publish npm package only after final name decision.
- Seed five good first issues.

## First 5 Issues To Seed

- Official MCP SDK transport adapter.
- Persistent approved runtime profiles.
- Zip download for trace bundle files.
- LangGraph/CrewAI adapter examples.
- Keyboard-first node and trace navigation.

## Show HN Draft

Show HN: AgentDesk, a local visual debugger for AI agent workflows

I built AgentDesk to make agent workflows easier to inspect. It gives you a graph canvas, click-linked traces, failed-step replay, prompt/tool/result debugging, artifact viewing, graph health checks, MCP config import with redaction, Ollama local execution for model nodes, Cloud BYOK OpenAI/Anthropic model nodes, loopback Runtime mode for local command nodes and MCP discovery, trace bundle exports, LangGraph/CrewAI starters, cost/token summaries, and portable JSON exports. Static hosted demos do not spawn local processes; live local/MCP execution requires the packaged CLI.

## HN Reply Notes

- AgentDesk is closer to a debugger than a workflow platform.
- Failed-step replay appends a replay event while preserving the original trace evidence.
- Local/MCP execution is intentionally loopback-only and explicit.
- Ollama live mode is local-only and opt-in.
- The next milestone is persistent approved runtime profiles and an official SDK transport adapter.
