import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

test("runs a workflow and links trace clicks with graph node clicks", async ({ page }) => {
  await page.goto("/");
  await selectDemo(page, "Repo QA Swarm");

  await page.getByRole("button", { name: "Run demo trace" }).click();

  await expect(page.getByRole("button", { name: "Inspect Final Reviewer" })).toBeVisible({
    timeout: 15_000
  });
  await expect(page.getByLabel("Run trace").getByText("Complete", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Inspect Browser MCP" }).click();
  await expect(page.getByLabel("Node debugger")).toContainText("Browser MCP");
  await expect(page.getByLabel("Node debugger")).toContainText("metadata-only tool simulation");

  await graphNode(page, "Test Runner").click();
  await expect(page.getByLabel("Node debugger")).toContainText("Test Runner");
  await expect(page.getByLabel("Node debugger")).toContainText('"provider": "local"');
});

test("replays a failed step and inspects captured artifacts", async ({ page }) => {
  await page.goto("/");
  await selectDemo(page, "Failure Replay Lab");

  await page.getByRole("button", { name: "Run demo trace" }).click();

  await expect(page.getByLabel("Node debugger")).toContainText("Browser Replay", {
    timeout: 12_000
  });
  await expect(page.getByLabel("Node debugger")).toContainText("DEMO_TOOL_TIMEOUT");

  await page.getByRole("tab", { name: "Trace" }).click();
  await expect(page.getByLabel("Run trace").getByText("Failed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Replay failed step" }).click();
  await expect(page.getByLabel("Node debugger")).toContainText("Latest event: complete");
  await expect(page.getByLabel("Node debugger")).toContainText("Replay result");

  await page.getByRole("tab", { name: "Artifacts" }).click();
  const artifactViewer = page.getByLabel("Artifact viewer");
  await expect(artifactViewer).toContainText(/captured/);

  await artifactViewer
    .getByRole("button")
    .filter({ hasText: "Browser Replay screenshot" })
    .first()
    .click();
  await expect(artifactViewer.getByRole("img", { name: "Browser Replay screenshot" })).toBeVisible();

  await artifactViewer
    .getByRole("button")
    .filter({ hasText: "Browser Replay stderr" })
    .first()
    .click();
  await expect(artifactViewer).toContainText("DEMO_TOOL_TIMEOUT");

  await page.getByRole("tab", { name: "Costs" }).click();
  await expect(page.getByLabel("Cost breakdown")).toContainText("mcp");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export replay session" }).click()
  ]);
  expect(download.suggestedFilename()).toMatch(/failure-replay\.agentdesk-session\.json$/);

  const replaySessionPath = await download.path();
  if (!replaySessionPath) {
    throw new Error("Playwright did not expose the replay-session download path.");
  }

  await page.reload();
  await expect(page.getByRole("heading", { name: "Failure Replay Lab" })).toBeVisible();

  await page.getByTestId("session-import-input").setInputFiles(replaySessionPath);
  await expect(page.getByRole("heading", { name: "Failure Replay Lab" })).toBeVisible();
  await expect(page.getByLabel("Cost breakdown")).toContainText("mcp");
  await page.getByRole("tab", { name: "Artifacts" }).click();
  await expect(page.getByLabel("Artifact viewer")).toContainText("Browser Replay stderr");
  await page.getByRole("tab", { name: "Debug" }).click();
  await expect(page.getByLabel("Node debugger")).toContainText("Browser Replay");
  await expect(page.getByLabel("Node debugger")).toContainText("Latest event: complete");
});

test("imports MCP metadata with readiness and risk labels", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("tab", { name: "MCP" }).click();
  await page.getByLabel("MCP configuration JSON").fill(
    JSON.stringify({
      mcpServers: {
        browser: {
          command: "npx",
          args: ["@agentdesk/browser-mcp"],
          env: {
            BROWSER_PROFILE: "agentdesk"
          }
        }
      }
    })
  );
  await page.getByTitle("Import MCP config").click();

  await expect(page.getByLabel("MCP importer")).toContainText("Needs approval");
  await expect(page.getByLabel("MCP importer")).toContainText("executes-local-code");
  await expect(page.getByLabel("MCP importer")).toContainText("requires-secrets");

  await page.getByRole("button", { name: "Add MCP nodes" }).click();
  await page.getByRole("tab", { name: "Validation" }).click();
  await expect(page.getByLabel("Graph validation")).toContainText(/warnings/);
});

test("configures BYOK cloud mode without exporting the API key", async ({ page }) => {
  await page.route("https://api.openai.com/v1/responses", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "resp_e2e",
        model: "gpt-5.5",
        output_text: "Cloud BYOK response captured.",
        usage: { input_tokens: 42, output_tokens: 7 }
      })
    });
  });
  await page.goto("/");
  await selectDemo(page, "Local Research Agent");

  await page.getByRole("tab", { name: "LLMs" }).click();
  await expect(page.getByLabel("LLM configuration")).toContainText("Bring your own key");
  await page.getByLabel("OpenAI API key").fill("sk-e2e-secret-value");
  await page.getByRole("button", { name: "Use Cloud mode" }).click();
  await page.getByRole("button", { name: "Apply to nodes" }).click();

  await page.getByRole("button", { name: "Run BYOK cloud" }).click();
  await expect(page.getByRole("button", { name: "Inspect Brief" })).toBeVisible({
    timeout: 15_000
  });
  await graphNode(page, "Cloud Synthesis").click();
  await expect(page.getByLabel("Node debugger")).toContainText("Cloud Synthesis");
  await expect(page.getByLabel("Node debugger")).toContainText("Cloud BYOK response captured.");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export replay session" }).click()
  ]);
  const replaySessionPath = await download.path();
  if (!replaySessionPath) {
    throw new Error("Playwright did not expose the replay-session download path.");
  }

  const exported = await readFile(replaySessionPath, "utf8");
  expect(exported).not.toContain("sk-e2e-secret-value");
});

test("surfaces graph validation issues from canvas edits", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("tab", { name: "Validation" }).click();
  await expect(page.getByLabel("Graph validation")).toContainText("Ready to run");

  await page
    .getByLabel("Workflow controls")
    .getByRole("button", { name: "Model" })
    .click();

  await expect(page.getByLabel("Graph validation")).toContainText(/warnings/);
  await expect(page.getByRole("button", { name: /Model Node has no outgoing edge/ })).toBeVisible();

  await page.getByRole("button", { name: /Model Node has no outgoing edge/ }).click();
  await expect(graphNode(page, "Model Node")).toHaveClass(/has-graph-issue/);
});

async function selectDemo(page: Page, name: string) {
  await page.getByLabel("Workflow controls").getByRole("button", { name: new RegExp(name) }).click();
}

function graphNode(page: Page, label: string) {
  return page.getByLabel("Workflow canvas").locator(".react-flow__node").filter({ hasText: label }).first();
}
