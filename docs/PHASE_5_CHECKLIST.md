# Phase 5 Checklist

Phase 5 made AgentDesk feel like a debugger, not just a workflow builder. At the time, non-Ollama MCP, cloud-provider, and local-tool steps remained simulated or metadata-only. Current releases add Cloud BYOK model-node execution while MCP/local-tool steps remain metadata-only or simulated.

## Completed

- Click a trace event to highlight its graph node.
- Click a node after a run to show the latest prompt, tool/model call, result, stdout, and stderr.
- Replay a failed step by appending a linked replay event without rerunning the whole workflow.
- Show provider/model cost breakdowns with event and token totals.
- View JSON, markdown, simulated screenshot SVG, stdout, and stderr artifacts.
- Validate graph health for cycles, duplicate IDs, missing endpoints, missing edges, unreachable outputs, and non-output dead ends.
- Export `0.3.0` replay sessions with sanitized `traceSummary`, debug payloads, artifacts, validation issues, costs, and full trace data.

## Verification

- `npm run verify` passes.
- `npm pack --dry-run --ignore-scripts --json` passes for `agentdesk@0.3.0`.
- Browser smoke covered Failure Replay Lab, failed-step replay, Debug, Trace, Artifacts, Costs, and Validation.
- 30/30 requested subagent verification passes were completed or addressed before release.
