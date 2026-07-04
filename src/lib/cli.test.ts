import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("../../bin/agentdesk.mjs", import.meta.url));

async function runCli(args: string[]) {
  try {
    await execFileAsync(process.execPath, [cliPath, ...args]);
    return { code: 0, stderr: "" };
  } catch (error) {
    const failure = error as { code?: number; stderr?: string };
    return {
      code: failure.code,
      stderr: failure.stderr ?? ""
    };
  }
}

describe("agentdesk CLI validation", () => {
  it.each([
    [["--port"], "AGENTDESK_PORT"],
    [["--port="], "AGENTDESK_PORT"],
    [["--host"], "AGENTDESK_HOST"],
    [["--host="], "AGENTDESK_HOST"]
  ])("rejects empty %s values", async (args, expectedMessage) => {
    const result = await runCli(args);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(expectedMessage);
  });
});
