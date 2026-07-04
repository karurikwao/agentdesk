import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const pkg = readJson("package.json");
const lock = readJson("package-lock.json");
const version = String(pkg.version);
const failures = [];

expect(lock.version === version, `package-lock root version ${lock.version} does not match package ${version}.`);
expect(
  lock.packages?.[""]?.version === version,
  `package-lock package entry version ${lock.packages?.[""]?.version} does not match package ${version}.`
);

const changelog = readText("CHANGELOG.md");
expect(
  changelog.includes(`## ${version} -`) || changelog.includes(`## v${version} -`),
  `CHANGELOG.md is missing a top-level ${version} release entry.`
);

const releasePath = `docs/RELEASE_v${version}.md`;
expect(existsSync(join(root, releasePath)), `${releasePath} is missing.`);
expect(existsSync(join(root, "docs/GOOD_FIRST_ISSUES.md")), "docs/GOOD_FIRST_ISSUES.md is missing.");
expect(existsSync(join(root, "docs/KILLER_DEMO.md")), "docs/KILLER_DEMO.md is missing.");
expect(existsSync(join(root, "docs/NPM_PUBLISH.md")), "docs/NPM_PUBLISH.md is missing.");
expect(
  existsSync(join(root, "docs/examples/failure-replay.agentdesk-session.json")),
  "docs/examples/failure-replay.agentdesk-session.json is missing."
);
expect(existsSync(join(root, "CONTRIBUTING.md")), "CONTRIBUTING.md is missing.");
expect(existsSync(join(root, "CODE_OF_CONDUCT.md")), "CODE_OF_CONDUCT.md is missing.");

const readme = readText("README.md");
const requiredReadmeStrings = [
  "Why Star This Repo",
  "Launch Install Paths",
  "Runtime mode",
  "2025-11-25"
];
for (const value of requiredReadmeStrings) {
  expect(readme.includes(value), `README.md is missing "${value}".`);
}

const requiredAssets = [
  "docs/assets/agentdesk-workflow-run.png",
  "docs/assets/agentdesk-start-here.png",
  "docs/assets/agentdesk-llm-config.png",
  "docs/assets/agentdesk-failure-debug.png",
  "docs/assets/agentdesk-artifacts.png",
  "docs/assets/agentdesk-social-card.png",
  "docs/assets/agentdesk-demo-loop.gif"
];
for (const asset of requiredAssets) {
  expect(existsSync(join(root, asset)), `${asset} is missing.`);
}

const replayExample = readJson("docs/examples/failure-replay.agentdesk-session.json");
expect(
  replayExample.schema === "agentdesk.replay-session.v1",
  "failure-replay.agentdesk-session.json has an unexpected schema."
);
expect(
  replayExample.workflow?.id === "failure-replay",
  "failure-replay.agentdesk-session.json is not for the Failure Replay Lab."
);
expect(
  Array.isArray(replayExample.trace) && replayExample.trace.some((event) => event.status === "failed"),
  "failure-replay.agentdesk-session.json must include a failed trace event."
);

const filesToScan = [
  "README.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "bin/agentdesk.mjs",
  "scripts/smoke-package.mjs",
  "docs/PROJECT_LAUNCH.md",
  "docs/LAUNCH_PLAN.md"
];
for (const file of filesToScan) {
  expect(!readText(file).includes("2025-06-18"), `${file} still references MCP 2025-06-18.`);
}

const packageFiles = pkg.files ?? [];
for (const file of [
  releasePath,
  "docs/GOOD_FIRST_ISSUES.md",
  "docs/KILLER_DEMO.md",
  "docs/NPM_PUBLISH.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md"
]) {
  expect(packageFiles.includes(file), `package.json files is missing ${file}.`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Release readiness verified for agentdesk@${version}`);

function readJson(path) {
  return JSON.parse(readText(path));
}

function readText(path) {
  return readFileSync(join(root, path), "utf8");
}

function expect(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}
