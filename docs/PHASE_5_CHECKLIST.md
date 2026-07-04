# Phase 5 Checklist

Phase 5 made AgentDesk feel like a debugger, not just a workflow builder. At the time, non-Ollama MCP, cloud-provider, and local-tool steps remained simulated or metadata-only. Current releases add Cloud BYOK model-node execution plus loopback Runtime mode for local command nodes and MCP discovery/execution.

## Completed

- Click a trace event to highlight its graph node.
- Click a node after a run to show the latest prompt, tool/model call, result, stdout, and stderr.
- Replay a failed step by appending a linked replay event without rerunning the whole workflow.
- Show provider/model cost breakdowns with event and token totals.
- View JSON, markdown, simulated screenshot SVG, stdout, and stderr artifacts.
- Validate graph health for cycles, duplicate IDs, missing endpoints, missing edges, unreachable outputs, and non-output dead ends.
- Historical Phase 5 export target: `0.3.0` replay sessions with sanitized `traceSummary`, debug payloads, artifacts, validation issues, costs, and full trace data. Current releases export the latest app version metadata.

## Verification

- `npm run verify` passes.
- Historical package gate passed for `agentdesk@0.3.0`; current release gates are tracked in `docs/PHASE_6_LAUNCH_GATE.md`.
- Browser smoke covered Failure Replay Lab, failed-step replay, Debug, Trace, Artifacts, Costs, and Validation.
- 30/30 requested subagent verification passes were completed or addressed before release.
