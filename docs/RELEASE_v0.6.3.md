# AgentDesk v0.6.3 Release Notes

AgentDesk v0.6.3 is a package-publishing patch release. It keeps the repo, product, and executable name as AgentDesk while publishing the npm package under the scoped name npm accepts.

## Highlights

- Changed the npm package name to `@papaplus/agentdesk` after npm blocked the unscoped `agentdesk` name as too similar to `agent-desk`.
- Kept the installed executable as `agentdesk`.
- Updated README, launch docs, publish runbook, and package smoke coverage for the scoped install path.

## Install

```bash
npx --yes --package=@papaplus/agentdesk agentdesk --port 5173
```

For global installs:

```bash
npm install -g @papaplus/agentdesk
agentdesk --port 5173
```

## v0.6.4 Note

On Windows, plain `npx @papaplus/agentdesk` can fail to resolve the `agentdesk` bin for scoped packages. Use the explicit package form above for the most portable one-command launch.

## Verification

```bash
npm run verify
npm run test:e2e
npm run smoke:package
npm pack --dry-run --ignore-scripts --json
npm publish --dry-run --access public
```
