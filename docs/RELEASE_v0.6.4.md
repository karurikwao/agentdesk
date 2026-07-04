# AgentDesk v0.6.4 Release Notes

AgentDesk v0.6.4 is a launch-command patch release for the scoped npm package.

## Highlights

- Updated the public quick start to use the portable npm exec form:

```bash
npx --yes --package=@papaplus/agentdesk agentdesk --port 5173
```

- Kept the package as `@papaplus/agentdesk` and the executable as `agentdesk`.
- Preserved the global install path:

```bash
npm install -g @papaplus/agentdesk
agentdesk --port 5173
```

## Verification

```bash
npm run verify
npm run smoke:package
npm exec --yes --package=@papaplus/agentdesk -- agentdesk --help
```
