"""Minimal LangGraph wiring for an AgentDesk export.

Safety notes:
- Keep API keys in your environment or secret manager, not in exported AgentDesk JSON.
- Treat local and MCP tools as side-effecting operations; approve the exact command/server first.
- Start with dry-run tool functions before connecting production services.
"""

from typing import Any, TypedDict

from langgraph.graph import END, StateGraph


class State(TypedDict, total=False):
    prompt: str
    draft: str
    evidence: list[dict[str, Any]]


def research_step(state: State) -> State:
    # Replace this stub with your model call, for example ChatOpenAI.invoke().
    return {
        **state,
        "draft": f"Research summary for: {state.get('prompt', 'missing prompt')}",
        "evidence": [{"source": "agentdesk-demo", "status": "stubbed"}],
    }


def tool_check_step(state: State) -> State:
    # Replace with an approved MCP/local tool call after reviewing side effects.
    evidence = list(state.get("evidence", []))
    evidence.append({"tool": "approved-mcp-tool", "ok": True})
    return {**state, "evidence": evidence}


graph = StateGraph(State)
graph.add_node("research", research_step)
graph.add_node("tool_check", tool_check_step)
graph.set_entry_point("research")
graph.add_edge("research", "tool_check")
graph.add_edge("tool_check", END)

app = graph.compile()

if __name__ == "__main__":
    print(app.invoke({"prompt": "debug a failed browser replay agent"}))
