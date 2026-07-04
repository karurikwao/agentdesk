# AgentDesk v0.7.0 Release Notes

AgentDesk v0.7.0 closes the first public issue queue and deepens the launch-ready debugger loop.

## Highlights

- Official MCP SDK stdio adapter inside the loopback Runtime mode boundary.
- Persistent approved runtime profile documents that keep command/MCP metadata and key names only.
- Trace bundle ZIP download with `manifest.json` and sanitized artifact paths.
- Small LangGraph and CrewAI example workflows under `docs/examples`.
- Keyboard-visible trace row inspection with Playwright coverage.

## Safety Contract

- Runtime execution remains loopback-only.
- Remote MCP probing is still explicit and user-triggered.
- Secret values are not stored in local runtime profiles or exports.
- MCP/local side effects remain visible through approval, readiness, and risk labels.

## Verification

```bash
npm run verify
npm run test:e2e
npm run smoke:package
npm pack --dry-run --ignore-scripts --json
```
