# Killer Demo: Debug A Broken Agent Run In 30 Seconds

This is the launch story for AgentDesk. It should be the first video, the README animation, and the live demo path.

## The Hook

An agent is asked to verify checkout after a UI change. It calls the browser MCP tool, times out, spends model tokens, and leaves the developer with a vague failure.

AgentDesk turns that into a replayable failure report:

- The failed trace event highlights the exact graph node.
- The debugger shows the prompt, tool call, result, stdout, and stderr.
- The artifact viewer keeps the screenshot, JSON payload, and markdown summary together.
- The cost tab shows which provider/model spent tokens.
- The validation tab proves the graph is structurally runnable.
- Failed-step replay adds a second event without erasing the original failure.
- Export creates a redacted replay session for an issue, PR, or handoff.

## Demo Script

1. Open https://agentdesk-clf.pages.dev/.
2. Click `Load lab` on the Start tab.
3. Click `Run current workflow`.
4. Click the failed `Browser Replay` trace event.
5. Point out the highlighted graph node.
6. Open `Debug` and show the failed tool call and stderr.
7. Open `Artifacts` and show the screenshot/JSON/markdown evidence.
8. Open `Costs` and point to provider/model spend.
9. Click `Replay failed step`.
10. Export the replay session.

## Launch Copy

Raw agent logs answer "something failed." AgentDesk answers "which node failed, what prompt/tool/result caused it, what it cost, what artifact proves it, and can I replay/share it?"

## Screenshot/GIF Recipe

Refresh launch screenshots and the README GIF with:

```bash
npm run screenshots:launch
npm run assets:readme-gif
```

The generated GIF is `docs/assets/agentdesk-demo-loop.gif`.
