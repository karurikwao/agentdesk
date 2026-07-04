"""Minimal CrewAI wiring for an AgentDesk export.

Safety notes:
- Store model credentials in environment variables or your deployment secret store.
- Review MCP and local tool side effects before giving an agent live tools.
- Keep the first run on fixture data, then compare the output with an AgentDesk trace.
"""

from crewai import Agent, Crew, Task


researcher = Agent(
    role="Agent run researcher",
    goal="Explain what happened in a failed agent trace",
    backstory="Turns AgentDesk replay evidence into concise debugging notes.",
)

tool_reviewer = Agent(
    role="Tool call reviewer",
    goal="Check approved MCP/local tool calls for risk before execution",
    backstory="Reviews commands, server IDs, and env/header key names without seeing secret values.",
)

research_task = Task(
    description="Summarize the failed Browser Replay event and the captured artifacts.",
    expected_output="A short failure summary with the likely cause and next action.",
    agent=researcher,
)

review_task = Task(
    description="Review the proposed MCP/local tool profile before a live rerun.",
    expected_output="A yes/no approval note with risks and missing key names.",
    agent=tool_reviewer,
)

crew = Crew(agents=[researcher, tool_reviewer], tasks=[research_task, review_task])

if __name__ == "__main__":
    # result = crew.kickoff()
    print("Crew ready. Uncomment kickoff after wiring your model provider and approved tools.")
