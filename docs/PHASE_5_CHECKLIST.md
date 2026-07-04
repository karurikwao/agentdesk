# Phase 5 Checklist

Phase 5 makes AgentDesk feel like a debugger, not just a workflow builder. Non-Ollama MCP, cloud-provider, and local-tool steps remain simulated or metadata-only.

## Completed

- Click a trace event to highlight its graph node.
- Click a node after a run to show the latest prompt, tool/model call, result, stdout, and stderr.
- Replay a failed step by appending a linked replay event without rerunning the whole workflow.
- Show provider/model cost breakdowns with event and token totals.
- View JSON, markdown, simulated screenshot SVG, stdout, and stderr artifacts.
- Validate graph health for cycles, duplicate IDs, missing endpoints, missing edges, unreachable outputs, and non-output dead ends.
- Export `0.2.0` workflows with sanitized `traceSummary`, debug payloads, artifacts, and full trace data.

## Verification

- `npm run verify` passes.
- `npm pack --dry-run --ignore-scripts --json` passes for `agentdesk@0.2.0`.
- Browser smoke covered Failure Replay Lab, failed-step replay, Debug, Trace, Artifacts, Costs, and Validation.
- 30/30 requested subagent verification passes were completed or addressed before release.
