import type { AgentWorkflow } from "../types/workflow";

export const demoWorkflows: AgentWorkflow[] = [
  {
    id: "repo-qa",
    name: "Repo QA Swarm",
    tagline: "Agentic code review with replayable traces",
    description:
      "Route a repository audit through a planner, browser checker, test runner, and final reviewer.",
    nodes: [
      {
        id: "trigger",
        type: "agentNode",
        position: { x: 0, y: 120 },
        data: {
          label: "Repo Trigger",
          kind: "trigger",
          description: "Watch a branch or PR and start a local run."
        }
      },
      {
        id: "planner",
        type: "agentNode",
        position: { x: 260, y: 20 },
        data: {
          label: "Planning Agent",
          kind: "model",
          provider: "anthropic",
          description: "Break the audit into isolated verification tasks."
        }
      },
      {
        id: "browser",
        type: "agentNode",
        position: { x: 520, y: 20 },
        data: {
          label: "Browser MCP",
          kind: "tool",
          provider: "mcp",
          description: "Planned browser tool step for screenshots and accessibility hints."
        }
      },
      {
        id: "tests",
        type: "agentNode",
        position: { x: 520, y: 220 },
        data: {
          label: "Test Runner",
          kind: "tool",
          provider: "local",
          description: "Planned local tool step for unit, type, and smoke checks."
        }
      },
      {
        id: "memory",
        type: "agentNode",
        position: { x: 780, y: 120 },
        data: {
          label: "Evidence Store",
          kind: "memory",
          provider: "local",
          description: "Persist findings, trace artifacts, and terminal summaries."
        }
      },
      {
        id: "reviewer",
        type: "agentNode",
        position: { x: 1040, y: 120 },
        data: {
          label: "Final Reviewer",
          kind: "output",
          provider: "openai",
          description: "Summarize risks, missing tests, and launch readiness."
        }
      }
    ],
    edges: [
      { id: "e-trigger-planner", source: "trigger", target: "planner", animated: true },
      { id: "e-planner-browser", source: "planner", target: "browser", animated: true },
      { id: "e-planner-tests", source: "planner", target: "tests", animated: true },
      { id: "e-browser-memory", source: "browser", target: "memory" },
      { id: "e-tests-memory", source: "tests", target: "memory" },
      { id: "e-memory-reviewer", source: "memory", target: "reviewer" }
    ]
  },
  {
    id: "local-research",
    name: "Local Research Agent",
    tagline: "Ollama-first analysis with optional cloud escalation",
    description:
      "Start local, inspect documents, escalate only the final synthesis to an API model when needed.",
    nodes: [
      {
        id: "drop",
        type: "agentNode",
        position: { x: 0, y: 110 },
        data: {
          label: "Drop Files",
          kind: "trigger",
          description: "Start with local notes, PDFs, logs, or markdown."
        }
      },
      {
        id: "extract",
        type: "agentNode",
        position: { x: 260, y: 110 },
        data: {
          label: "Extractor",
          kind: "tool",
          provider: "local",
          description: "Chunk and normalize source material."
        }
      },
      {
        id: "ollama",
        type: "agentNode",
        position: { x: 520, y: 20 },
        data: {
          label: "Ollama Draft",
          kind: "model",
          provider: "ollama",
          model: "llama3.2",
          timeoutMs: 20000,
          promptTemplate:
            "You are an AgentDesk local research assistant. Summarize the workflow state and choose the safest next debugging step.",
          description: "Run a private first-pass analysis locally through Ollama."
        }
      },
      {
        id: "router",
        type: "agentNode",
        position: { x: 780, y: 110 },
        data: {
          label: "Escalation Router",
          kind: "router",
          description: "Escalate only difficult steps based on confidence."
        }
      },
      {
        id: "cloud",
        type: "agentNode",
        position: { x: 1040, y: 20 },
        data: {
          label: "Cloud Synthesis",
          kind: "model",
          provider: "openai",
          description: "Optional high-quality synthesis on selected chunks."
        }
      },
      {
        id: "brief",
        type: "agentNode",
        position: { x: 1040, y: 210 },
        data: {
          label: "Brief",
          kind: "output",
          description: "Markdown, JSON, or clipboard-ready result."
        }
      }
    ],
    edges: [
      { id: "e-drop-extract", source: "drop", target: "extract", animated: true },
      { id: "e-extract-ollama", source: "extract", target: "ollama", animated: true },
      { id: "e-ollama-router", source: "ollama", target: "router" },
      { id: "e-router-cloud", source: "router", target: "cloud" },
      { id: "e-router-brief", source: "router", target: "brief" },
      { id: "e-cloud-brief", source: "cloud", target: "brief" }
    ]
  },
  {
    id: "mcp-router",
    name: "MCP Tool Router",
    tagline: "Compare local tools, browser tools, and API tools in one trace",
    description:
      "Import MCP servers and route an agent through the right tool with cost and failure visibility.",
    nodes: [
      {
        id: "intent",
        type: "agentNode",
        position: { x: 0, y: 110 },
        data: {
          label: "User Intent",
          kind: "prompt",
          description: "Capture the task and success criteria."
        }
      },
      {
        id: "agent",
        type: "agentNode",
        position: { x: 260, y: 110 },
        data: {
          label: "Tool-Using Agent",
          kind: "model",
          provider: "anthropic",
          description: "Plan the minimum tool calls required."
        }
      },
      {
        id: "filesystem",
        type: "agentNode",
        position: { x: 520, y: 0 },
        data: {
          label: "Filesystem MCP",
          kind: "tool",
          provider: "mcp",
          description: "Planned scoped file access through an MCP server."
        }
      },
      {
        id: "browser",
        type: "agentNode",
        position: { x: 520, y: 155 },
        data: {
          label: "Browser MCP",
          kind: "tool",
          provider: "mcp",
          description: "Verify visual and interactive states."
        }
      },
      {
        id: "shell",
        type: "agentNode",
        position: { x: 780, y: 80 },
        data: {
          label: "Shell Guard",
          kind: "tool",
          provider: "local",
          description: "Planned command review step before any future execution."
        }
      },
      {
        id: "report",
        type: "agentNode",
        position: { x: 1040, y: 110 },
        data: {
          label: "Replay Report",
          kind: "output",
          description: "Shareable trace with prompts, calls, outputs, and artifacts."
        }
      }
    ],
    edges: [
      { id: "e-intent-agent", source: "intent", target: "agent", animated: true },
      { id: "e-agent-filesystem", source: "agent", target: "filesystem" },
      { id: "e-agent-browser", source: "agent", target: "browser" },
      { id: "e-filesystem-shell", source: "filesystem", target: "shell" },
      { id: "e-browser-shell", source: "browser", target: "shell" },
      { id: "e-shell-report", source: "shell", target: "report", animated: true }
    ]
  },
  {
    id: "failure-replay",
    name: "Failure Replay Lab",
    tagline: "Debug a failed MCP tool step without raw log archaeology",
    description:
      "Watch a planned browser tool fail, preserve the trace, and inspect the replay artifact.",
    nodes: [
      {
        id: "intent",
        type: "agentNode",
        position: { x: 0, y: 120 },
        data: {
          label: "Bug Report",
          kind: "prompt",
          description: "A user reports that checkout fails after a UI change."
        }
      },
      {
        id: "triage",
        type: "agentNode",
        position: { x: 260, y: 120 },
        data: {
          label: "Triage Agent",
          kind: "model",
          provider: "ollama",
          model: "llama3.2",
          description: "Build a local hypothesis before touching tools."
        }
      },
      {
        id: "browser-fail",
        type: "agentNode",
        position: { x: 520, y: 35 },
        data: {
          label: "Browser Replay",
          kind: "tool",
          provider: "mcp",
          description: "Simulated browser MCP timeout with preserved replay context.",
          config: {
            demoFailure: true
          }
        }
      },
      {
        id: "artifact",
        type: "agentNode",
        position: { x: 780, y: 120 },
        data: {
          label: "Failure Artifact",
          kind: "memory",
          provider: "local",
          description: "Capture screenshot, command, stderr, and prior prompt context."
        }
      },
      {
        id: "fix",
        type: "agentNode",
        position: { x: 1040, y: 120 },
        data: {
          label: "Fix Plan",
          kind: "output",
          description: "Produce a replayable failure report and next action."
        }
      }
    ],
    edges: [
      { id: "e-intent-triage", source: "intent", target: "triage", animated: true },
      { id: "e-triage-browser", source: "triage", target: "browser-fail", animated: true },
      { id: "e-browser-artifact", source: "browser-fail", target: "artifact" },
      { id: "e-artifact-fix", source: "artifact", target: "fix" }
    ]
  }
];

export const paletteKinds = [
  {
    kind: "model",
    label: "Model",
    description: "Ollama, OpenAI, Anthropic, or local adapter"
  },
  {
    kind: "tool",
    label: "MCP Tool",
    description: "Browser, filesystem, shell, database, or custom MCP server"
  },
  {
    kind: "router",
    label: "Router",
    description: "Route by confidence, cost, provider, or safety policy"
  },
  {
    kind: "memory",
    label: "Memory",
    description: "Store artifacts, context, cache, or evidence"
  },
  {
    kind: "output",
    label: "Output",
    description: "Markdown, JSON, code patch, report, or webhook"
  }
] as const;
