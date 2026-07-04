# Contributing

AgentDesk is early. The best contributions are small, visible improvements that make the workflow debugger more trustworthy.

## Good First Areas

- Demo workflows that make a real debugging use case obvious.
- MCP config parsing fixtures from real clients.
- Trace and export redaction tests.
- Accessibility and keyboard interaction improvements.
- README screenshots, GIFs, and example workflows.
- Framework adapter examples for LangGraph, CrewAI, OpenAI Agents SDK, and Vercel AI SDK.

Start with the live [`good first issue` queue](https://github.com/karurikwao/agentdesk/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22). The seed list lives in [`docs/GOOD_FIRST_ISSUES.md`](./docs/GOOD_FIRST_ISSUES.md).

## Local Setup

Prerequisite: Node.js 20.19.0 or newer.

```bash
npm install
npm run dev
npm run test
npm run build
```

The fastest launch confidence pass is:

```bash
npm run verify
npm run test:e2e
npm run smoke:package
npm pack --dry-run --ignore-scripts --json
```

Use this for visual launch assets:

```bash
npm run screenshots:launch
npm run assets:readme-gif
```

## Pull Request Checklist

- `npm run verify` passes.
- `npm run test:e2e` passes for UI changes.
- `npm run smoke:package` passes for CLI/runtime/package changes.
- UI changes include a screenshot.
- MCP or export changes include redaction tests.
- No secrets, private paths, or real MCP configs are committed.

## Demo Contributions

The most useful demos show a specific failure and the evidence AgentDesk captures. A strong demo answers:

- Which node failed?
- What prompt, tool/model call, result, stdout, or stderr explains it?
- What artifact proves it?
- What did it cost?
- Can the failure be replayed or exported?

Use [`docs/KILLER_DEMO.md`](./docs/KILLER_DEMO.md) as the launch-quality bar.

## Safety

Do not add code that automatically executes imported MCP commands, shell commands, or package installers without an explicit approval flow and tests.
