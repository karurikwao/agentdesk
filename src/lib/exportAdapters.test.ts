import { describe, expect, it } from "vitest";
import { demoWorkflows } from "../data/workflows";
import { createTraceEvent } from "./runEngine";
import { createCrewAiExport, createLangGraphExport, createTraceBundle } from "./exportAdapters";

describe("framework exports and trace bundles", () => {
  it("creates deterministic LangGraph and CrewAI starter files", () => {
    const workflow = demoWorkflows[2];
    const langGraph = createLangGraphExport(workflow);
    const crewAi = createCrewAiExport(workflow);

    expect(langGraph.filename).toBe("mcp-router.langgraph.py");
    expect(langGraph.content).toContain("StateGraph");
    expect(langGraph.content).toContain("WORKFLOW");
    expect(langGraph.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("MCP")])
    );

    expect(crewAi.filename).toBe("mcp-router.crewai.py");
    expect(crewAi.content).toContain("Crew");
    expect(crewAi.content).toContain("TASK_DEFS");
  });

  it("creates a manifest-style trace bundle with artifact file entries", () => {
    const workflow = demoWorkflows[3];
    const failed = createTraceEvent(workflow, "browser-fail", 2, "run-1");
    const bundle = createTraceBundle(workflow, [failed]);

    expect(bundle.schema).toBe("agentdesk.trace-bundle.v1");
    expect(bundle.files[0].path).toBe("manifest.json");
    expect(bundle.files.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/payload\.json$/),
        expect.stringMatching(/notes\.md$/),
        expect.stringMatching(/stdout\.log$/),
        expect.stringMatching(/stderr\.log$/),
        expect.stringMatching(/screenshot\.svg$/)
      ])
    );
    expect(bundle.files.every((file) => !file.path.includes(".."))).toBe(true);
  });
});
