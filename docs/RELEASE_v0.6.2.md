# AgentDesk v0.6.2 Release Notes

AgentDesk v0.6.2 is the launch-conversion polish pass. It sharpens the first 30 seconds around the strongest promise: failed AI agent runs become clickable, replayable evidence bundles.

## Highlights

- Failure Replay Lab is now the default live workflow.
- README and GitHub Pages now lead with a lightweight failure replay GIF.
- Added an importable `docs/examples/failure-replay.agentdesk-session.json` proof artifact.
- Added parser coverage for the public replay-session example.
- Added Code of Conduct, stronger contributor guidance, NPM publish runbook, and live good-first-issue links.
- Updated repo/package positioning around replaying failures, inspecting prompts/tools/results, and exporting redacted evidence.
- Enabled GitHub Discussions and updated repo homepage, description, and topics.

## Verification

Run before announcing or publishing:

```bash
npm run assets:readme-gif
npm run verify
npm run test:e2e
npm run smoke:package
npm pack --dry-run --ignore-scripts --json
npm publish --dry-run --access public
```

## NPM Status

The package name `agentdesk` returned 404/unpublished on July 4, 2026. Publishing still requires an authenticated npm account:

```bash
npm login --auth-type=web
npm publish --access public
```

## Links

- Live demo: https://agentdesk-clf.pages.dev/
- Launch page: https://karurikwao.github.io/agentdesk/
- Repository: https://github.com/karurikwao/agentdesk
- Killer demo script: https://github.com/karurikwao/agentdesk/blob/main/docs/KILLER_DEMO.md
