import { strict as assert } from "node:assert";
import { join } from "node:path";

export async function runRunnerCompactionSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: runner compaction context sync ---");
  const { createRunner } = await import("../src/agent/runner.mjs");
  const { loadPiSessionSidecar } = await import("../src/session/sidecar.mjs");

  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = previousKey || "test-key";

  const session = {
    model: { id: "deepseek-v4-pro", provider: "deepseek" },
    thinkingLevel: "medium",
    sessionManager: {
      isPersisted: () => true,
      getSessionFile: () => "compact.jsonl",
    },
    getActiveToolNames: () => ["read"],
    getToolDefinition: () => ({ description: "Read file", parameters: { properties: { path: { description: "Path" } } } }),
    getSessionStats: () => ({
      sessionId: "compact-session",
      userMessages: 1,
      assistantMessages: 1,
      toolCalls: 0,
      totalMessages: 2,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      cost: 0,
    }),
    compact: async () => ({ summary: "manual compact summary" }),
    dispose: () => {},
  };
  const runner = await createRunner({
    cwd: dir,
    modelId: "deepseek-v4-pro",
    provider: "deepseek",
    stateRoot: join(dir, ".state"),
    ui: {},
    skills: [],
    pins: [],
    projectMarchDir,
    syncPiSidecar: true,
    createAgentSessionImpl: async () => ({ session }),
  });

  const result = await runner.compact();
  assert.equal(result.summary, "manual compact summary");
  assert.ok(runner.engine.buildContext("").includes("<CompactedHistory>\nmanual compact summary\n</CompactedHistory>"));
  const sidecar = loadPiSessionSidecar({ projectMarchDir, sessionRef: "compact.jsonl" });
  assert.equal(sidecar.state.compactionSummary, "manual compact summary");

  if (previousKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = previousKey;
  }
  cleanup(dir);
  console.log("  PASS");
}
