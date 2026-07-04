# NPM Publish Runbook

The package name `agentdesk` returned 404/unpublished on July 4, 2026. Publish only from a clean, green `main` commit.

## Preflight

```bash
git status --short
npm whoami
npm run verify
npm run test:e2e
npm run smoke:package
npm pack --dry-run --ignore-scripts --json
```

If `npm whoami` returns `ENEEDAUTH`, log in first:

```bash
npm login --auth-type=web
```

## Publish

```bash
npm publish --access public
npm view agentdesk version
```

## Post-Publish Updates

1. Replace README/package docs that say `agentdesk` is unpublished.
2. Move `npx agentdesk --port 5173` to the top Quick Start.
3. Add the npm version badge.
4. Create a small patch release if package docs need correction.

## Rollback Notes

NPM packages cannot be fully unpublished after the short unpublish window without ecosystem impact. If the package is broken, prefer publishing a fixed patch version quickly and marking the broken version deprecated.
