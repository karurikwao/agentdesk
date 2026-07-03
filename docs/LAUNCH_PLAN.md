# AgentDesk Launch Plan

## GitHub Repo Metadata

- Name: `agentdesk`
- Description: `Local visual debugger for AI agent workflows across MCP tools, local models, and simulated cloud-provider steps.`
- Topics: `ai-agents`, `mcp`, `ollama`, `developer-tools`, `react-flow`, `agent-workflows`

## Launch Threshold

- `npm run verify` passes.
- `npm pack --dry-run` includes README, license, security notes, built app, and screenshot asset.
- README includes screenshot/GIF, quick start, current limits, and MCP safety contract.
- Browser smoke covers demo run, simulated failure trace, whole-run replay, MCP import redaction, and Ollama failure handling when Ollama is unavailable.

## Demo Script

1. Open AgentDesk.
2. Pick `Failure Replay Lab`.
3. Click `Run demo trace`.
4. Inspect the failed browser step and output/error preview.
5. Import `docs/examples/mcp-claude-desktop.json`.
6. Show readiness/risk flags and add MCP nodes.
7. Switch to `Local Research Agent`, choose `Ollama`, and run against local Ollama if available.
8. Export the `.agentdesk.json` trace and point out `portableWorkflow` and `traceSummary`.

## Known Limitations

- Imported MCP commands are not executed.
- Remote MCP URLs are not probed automatically.
- Ollama live mode depends on a local Ollama runtime and browser-accessible CORS settings.
- Cloud-provider nodes are simulated; OpenAI/Anthropic execution is not enabled yet.
- There is no persistent project storage yet.

## Launch-Day Checklist

- Record a 10-second README GIF.
- Publish repo with CI passing.
- Create `v0.1.0` GitHub release.
- Verify package dry run.
- Reserve/publish npm package only after final name decision.
- Seed five good first issues.

## First 5 Issues To Seed

- Approval-gated MCP SDK runner.
- Real MCP initialize/list-tools discovery.
- Trace bundle export with screenshots/stdout/stderr.
- LangGraph export adapter.
- Keyboard-first node and trace navigation.

## Show HN Draft

Show HN: AgentDesk, a local visual debugger for AI agent workflows

I built AgentDesk to make agent workflows easier to inspect. It gives you a graph canvas, replayable traces, MCP config import with redaction, Ollama local execution for model nodes, simulated failure traces, cost/token summaries, and portable JSON exports. Imported MCP commands and cloud-provider nodes are metadata-only in this release.

## HN Reply Notes

- AgentDesk is closer to a debugger than a workflow platform.
- MCP command execution is intentionally not enabled yet.
- Ollama live mode is local-only and opt-in.
- The next milestone is an approval-gated MCP SDK runner.
