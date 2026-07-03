# Contributing

AgentDesk is early. The best contributions are small, visible improvements that make the workflow debugger more trustworthy.

## Good First Areas

- Demo workflows that make a real debugging use case obvious.
- MCP config parsing fixtures from real clients.
- Trace and export redaction tests.
- Accessibility and keyboard interaction improvements.
- README screenshots, GIFs, and example workflows.

## Local Setup

Prerequisite: Node.js 20 or newer.

```bash
npm install
npm run dev
npm run test
npm run build
```

## Pull Request Checklist

- `npm run typecheck` passes.
- `npm run test` passes.
- `npm run build` passes.
- UI changes include a screenshot.
- MCP or export changes include redaction tests.
- No secrets, private paths, or real MCP configs are committed.

## Safety

Do not add code that automatically executes imported MCP commands, shell commands, or package installers without an explicit approval flow and tests.
