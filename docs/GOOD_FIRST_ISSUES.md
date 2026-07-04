# Good First Issues To Seed

These are the first public issue templates for `v0.6.1`. The initial set has been seeded on GitHub; keep this file as reusable copy for relabeling, reopening, or creating follow-up beginner-friendly work without opening dangerous runtime surfaces by default.

Live queue: https://github.com/karurikwao/agentdesk/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22

## 1. Add Official MCP SDK Transport Adapter

Labels: `enhancement`, `good first issue`, `mcp`

AgentDesk currently has a minimal JSON-RPC runtime for MCP `2025-11-25` stdio and Streamable HTTP. Add an optional adapter layer using the official MCP SDK while preserving the existing safety contract:

- loopback Runtime mode only
- no automatic remote probing
- redacted artifacts
- timeout and output caps
- package smoke coverage

Acceptance:

- Adapter is isolated behind the existing runtime boundary.
- Existing smoke tests still pass.
- New tests cover initialize, paginated `tools/list`, `tools/call`, and `isError`.

## 2. Add Persistent Approved Runtime Profiles

Labels: `enhancement`, `good first issue`, `runtime`

Runtime MCP configs are currently session/import driven. Add a local profile format for approved commands and MCP servers without storing secret values.

Acceptance:

- Profiles store command, args, cwd, server id, and env/header key names only.
- Secret values remain out of exports and local profile files.
- UI clearly distinguishes imported, approved, and blocked profiles.

## 3. Add Zip Download For Trace Bundle Files

Labels: `enhancement`, `good first issue`, `export`

AgentDesk exports a trace bundle manifest inside replay-session JSON. Add a zip download that writes the manifest plus artifact files using the existing trace bundle paths.

Acceptance:

- Zip includes `manifest.json` and artifact files.
- Paths are sanitized and cannot traverse directories.
- Existing replay-session export remains unchanged.

## 4. Add LangGraph And CrewAI Example Workflows

Labels: `documentation`, `good first issue`, `adapters`

AgentDesk exports starter LangGraph and CrewAI files. Add docs/examples showing how a user can take those starter files and wire real model/tool calls.

Acceptance:

- Add one LangGraph example and one CrewAI example under `docs/examples`.
- Include safety notes about secrets and local/MCP tool side effects.
- Keep examples small enough to read in under five minutes.

## 5. Add Keyboard Navigation For Trace And Nodes

Labels: `enhancement`, `good first issue`, `accessibility`

Improve keyboard-first debugging by making trace rows and graph node inspection easier without a mouse.

Acceptance:

- Trace rows can be selected with keyboard focus.
- Enter/Space inspects the selected event.
- Focus states are visible and match the current blue/violet/cyan visual system.
- Playwright coverage verifies at least one keyboard inspection path.
