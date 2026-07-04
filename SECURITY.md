# Security

AgentDesk is local-first and safety-biased. The current release parses and visualizes MCP configuration metadata, but it does not execute imported MCP commands or automatically probe remote MCP URLs.

## Reporting

Use GitHub private vulnerability reporting for secret handling, command execution, redaction, or local network probing issues. Do not file public issues containing real API keys, tokens, private paths, screenshots of secrets, or private MCP configs.

## Current Safety Rules

- Ollama live mode only sends requests to `http://127.0.0.1:11434/api/generate`.
- Imported MCP commands are metadata-only unless a future approval-gated runner is added.
- Remote MCP URLs are parsed and redacted; they are not fetched automatically.
- Replay-session exports redact common secret names, token formats, URLs, validation messages, imported MCP metadata, debug payloads, artifacts, and private user path prefixes.
- Do not paste real secrets into node labels, prompts, Ollama responses, stdout/stderr, screenshots, artifacts, or invalid MCP JSON. React escapes text for XSS safety, but local UI display is not a secret vault.
- New MCP/import/export changes must include redaction tests.
