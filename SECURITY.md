# Security

AgentDesk is local-first and safety-biased. The current release can run local Ollama model nodes, browser-direct BYOK OpenAI/Anthropic model nodes, and loopback Runtime mode for approved local command and MCP discovery/execution.

## Reporting

Use GitHub private vulnerability reporting for secret handling, command execution, redaction, or local network probing issues. Do not file public issues containing real API keys, tokens, private paths, screenshots of secrets, or private MCP configs.

## Current Safety Rules

- Ollama live mode only sends requests to `http://127.0.0.1:11434/api/generate`.
- Cloud BYOK mode sends configured OpenAI/Anthropic model-node prompts directly from the browser tab using the user's session-only API key.
- BYOK API keys are held in React state until forgotten or the tab closes, and are not written to localStorage, replay sessions, workflow exports, or debug payloads.
- Browser-direct cloud requests are visible to the browser/network stack, may be blocked by provider CORS or organization policy, and are not a production secret boundary.
- BYOK prompts and responses are captured as trace/debug/artifact evidence.
- Local command and MCP execution require the packaged CLI on `127.0.0.1` or `localhost`, Runtime mode, JSON-only runtime requests, and an explicit UI action.
- MCP 2025-11-25 stdio execution uses child processes with `shell: false`, timeouts, stdout/stderr caps, and redacted evidence. Shell commands are blocked unless `AGENTDESK_ALLOW_SHELL=1` is set before launch.
- Remote MCP Streamable HTTP URLs are parsed and redacted at import time, and are probed only when the user clicks live discovery in Runtime mode.
- Replay-session exports redact common secret names, token formats, URLs, validation messages, imported MCP metadata, debug payloads, artifacts, and private user path prefixes.
- Do not paste real secrets or private data into node labels, prompts, model responses, stdout/stderr, screenshots, artifacts, or invalid MCP JSON. React escapes text for XSS safety, but local UI display is not a secret vault.
- New BYOK, MCP, local runtime, import, or export changes must include redaction and runtime-boundary tests.
