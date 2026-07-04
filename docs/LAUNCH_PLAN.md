# AgentDesk Launch Plan

## GitHub Repo Metadata

- Name: `agentdesk`
- Description: `Local visual debugger for AI agent workflows across MCP metadata, local Ollama model nodes, and simulated cloud-provider steps.`
- Topics: `ai-agents`, `mcp`, `ollama`, `developer-tools`, `react-flow`, `agent-workflows`

## Launch Threshold

- `npm run verify` passes.
- `npm pack --dry-run` includes README, license, security notes, built app, and screenshot asset.
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
9. Switch to `Local Research Agent`, choose `Ollama`, and run against local Ollama if available.
10. Export the `.agentdesk.json` trace and point out `portableWorkflow` and `traceSummary`.

## Known Limitations

- Imported MCP commands and local tool nodes are not executed.
- Remote MCP URLs are not probed automatically.
- Ollama live mode depends on a local Ollama runtime and browser-accessible CORS settings.
- Cloud-provider nodes are simulated; OpenAI/Anthropic execution is not enabled yet.
- There is no persistent project storage yet.

## Public Launch Checklist

- Keep the current README screenshot or replace it with a 10-second GIF.
- Confirm repo CI is passing on `main`.
- Create `v0.2.0` GitHub release.
- Verify package dry run.
- Reserve/publish npm package only after final name decision.
- Seed five good first issues.

## First 5 Issues To Seed

- Approval-gated MCP SDK runner.
- Real MCP initialize/list-tools discovery.
- Multi-file trace bundle export with screenshots/stdout/stderr.
- LangGraph export adapter.
- Keyboard-first node and trace navigation.

## Show HN Draft

Show HN: AgentDesk, a local visual debugger for AI agent workflows

I built AgentDesk to make agent workflows easier to inspect. It gives you a graph canvas, click-linked traces, failed-step replay, prompt/tool/result debugging, artifact viewing, graph health checks, MCP config import with redaction, Ollama local execution for model nodes, simulated failure traces, cost/token summaries, and portable JSON exports. Only Ollama model nodes execute live; imported MCP commands, local-tool steps, and cloud-provider nodes are metadata-only or simulated in this release.

## HN Reply Notes

- AgentDesk is closer to a debugger than a workflow platform.
- Failed-step replay appends a replay event while preserving the original trace evidence.
- MCP command execution is intentionally not enabled yet.
- Ollama live mode is local-only and opt-in.
- The next milestone is an approval-gated MCP SDK runner.
