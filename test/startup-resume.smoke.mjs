import { strict as assert } from "node:assert";
import { join } from "node:path";

export async function runStartupResumeSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: startup resume source routing ---");
  const { loadOrCreateProjectId, resumeStartupSession } = await import("../src/cli/startup/startup-session.mjs");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const { savePiSessionSidecar } = await import("../src/session/sidecar.mjs");
  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  const projectId = loadOrCreateProjectId(projectMarchDir);
  assert.equal(loadOrCreateProjectId(projectMarchDir), projectId);
  const statuses = [];
  const ui = { status: (line) => statuses.push(line) };
  const engine = new ContextEngine({ cwd: dir, modelId: "test", provider: "deepseek" });
  const sourceEngine = new ContextEngine({ cwd: dir, modelId: "test", provider: "deepseek" });
  sourceEngine.recordTurn({ userMessage: "hello", assistantMessage: "answer" });
  savePiSessionSidecar({
    projectMarchDir,
    sessionRef: "pi.jsonl",
    engine: sourceEngine,
    metadata: { sessionId: "pi-start", sessionFile: "pi.jsonl" },
  });
  let switchedPath = null;
  const runner = {
    canSwitchPiSession: () => true,
    engine,
    switchPiSession: async (path) => {
      switchedPath = path;
      return { cancelled: false };
    },
  };
  const result = await resumeStartupSession({
    resumeId: "pi",
    runner,
    sessionState: { sessionId: "new", sessionDir: "unused" },
    projectMarchDir,
    ui,
    listPiSessions: async () => [{ id: "pi-start", path: "pi.jsonl" }],
  });
  assert.equal(result.source, "pi");
  assert.equal(switchedPath, "pi.jsonl");
  assert.equal(engine.turns[0].assistantMessage, "answer");
  assert.ok(statuses.includes("Resumed pi session: pi-start"));

  // No resumeId case
  const noop = await resumeStartupSession({
    resumeId: null,
    runner,
    sessionState: { sessionId: "any", sessionDir: "unused" },
    projectMarchDir,
    ui,
    listPiSessions: async () => [],
  });
  assert.equal(noop.source, "none");

  cleanup(dir);
  console.log("  PASS");
}
