# AgentDesk v0.6.1 Release Notes

AgentDesk is a local visual debugger for AI agent workflows. This release makes the repo launch-ready around the core promise: replay a failed run, inspect every prompt/tool/result/artifact, validate the graph, and export redacted evidence.

## Highlights

- Local graph canvas with click-linked trace events and graph nodes.
- Failed-step replay that keeps the original failed event intact.
- Debug panels for prompt, tool/model call, result, stdout, stderr, artifacts, cost, and graph validation.
- Local Ollama model-node execution.
- Session-only BYOK OpenAI/Anthropic model-node execution.
- Packaged loopback Runtime mode for approved local command nodes and MCP execution.
- MCP `2025-11-25` stdio and Streamable HTTP support with initialize, paginated `tools/list`, optional `tools/call`, negotiated protocol headers, tool descriptor metadata, and `isError` trace failures.
- Replay-session export with portable workflow data, trace summary, trace bundle manifest, LangGraph starter, CrewAI starter, artifacts, validation issues, and redaction.
- GitHub Pages launch page, Cloudflare demo, package smoke, browser e2e tests, and release-readiness checks.

## Install Paths

### From Source

```bash
git clone https://github.com/karurikwao/agentdesk.git
cd agentdesk
npm install
npm run dev
```

### Packaged Local Runtime

```bash
npm run build
node ./bin/agentdesk.mjs --port 5173
```

Open `http://127.0.0.1:5173`, check the Doctor tab, then switch to Runtime mode for local command and MCP execution.

### After NPM Publish

```bash
npx --yes --package=@papaplus/agentdesk agentdesk --port 5173
```

The unscoped package name `agentdesk` was later blocked by npm as too similar to `agent-desk`; the launch package is scoped as `@papaplus/agentdesk`.

## Verification

Run before publishing or announcing:

```bash
npm run typecheck
npm test
npm run build
npm run smoke:package
npm run test:e2e
npm run check:launch-page
npm run check:release
npm pack --dry-run --ignore-scripts --json
npm audit --audit-level=moderate
```

## Known Limits

- Static hosted demos cannot spawn local processes; use the packaged loopback CLI for Runtime mode.
- Shell commands are blocked unless `AGENTDESK_ALLOW_SHELL=1` is set before CLI launch.
- Browser-direct OpenAI/Anthropic calls can be blocked by provider CORS, browser policy, or organization settings.
- Production apps should proxy cloud model calls through a backend secret boundary.
- BYOK prompts and responses become trace/debug/artifact evidence, though API keys are excluded from exports.
- Workflow execution is linear/topological; advanced branching and joins are schema-ready but not fully interactive.

## Links

- Live demo: https://agentdesk-clf.pages.dev/
- Launch page: https://karurikwao.github.io/agentdesk/
- Repository: https://github.com/karurikwao/agentdesk
