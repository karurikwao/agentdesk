# Phase 6 Launch Surface Gate

Phase 6 makes AgentDesk publicly launchable beyond the app itself: GitHub Pages, screenshots, launch copy, package inclusion, and verification evidence.

## Deliverables

- `docs/index.html` is a GitHub Pages-ready launch page.
- `docs/project-launch.html` is a polished launch-details page for Pages visitors.
- `docs/PROJECT_LAUNCH.md` contains launch copy, screenshots, public URLs, known limits, and launch scripts.
- GitHub Pages is configured to publish the `docs/` folder from `main`.
- `.github/workflows/ci.yml` verifies the launch-page references before package smoke and browser tests.
- `scripts/capture-launch-screenshots.mjs` regenerates launch screenshots from the built app.
- README links to the launch page and screenshot set.
- Package dry-run includes `docs/index.html`, `docs/project-launch.html`, launch docs, examples, and assets.

## Screenshot Gate

- Capture Start tab: `docs/assets/agentdesk-start-here.png`.
- Capture LLM config: `docs/assets/agentdesk-llm-config.png`.
- Capture failed-step debugger: `docs/assets/agentdesk-failure-debug.png`.
- Capture artifact viewer: `docs/assets/agentdesk-artifacts.png`.
- Keep README hero screenshot: `docs/assets/agentdesk-workflow-run.png`.

## Verification Gate

- `npm run verify`
- `npm run test:e2e`
- `npm run smoke:package`
- `npm pack --dry-run --ignore-scripts --json`
- `npm run screenshots:launch`
- Cloudflare Pages smoke check returns the new build.
- GitHub Actions CI completes successfully on `main`.
- GitHub Pages URL returns the launch page from `main` `/docs`.

## Hold Conditions

- Hold launch if screenshots are stale, GitHub Pages files are missing from package output, CI fails, BYOK keys appear in exported replay sessions, public copy omits browser-direct/CORS/proxy caveats for BYOK cloud calls, or public copy implies MCP/local tool execution that is not implemented.
