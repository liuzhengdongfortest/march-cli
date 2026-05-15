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
  const engine = new ContextEngine({ cwd: dir, modelId: "test", provider: "deepseek", skills: [], pins: [] });
  const sourceEngine = new ContextEngine({ cwd: dir, modelId: "test", provider: "deepseek", skills: [], pins: ["pinned"] });
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
    usePiSessionDefaults: true,
    runner,
    sessionState: { sessionId: "legacy", sessionDir: "unused" },
    projectMarchDir,
    ui,
    listPiSessions: async () => [{ id: "pi-start", path: "pi.jsonl" }],
  });
  assert.equal(result.source, "pi");
  assert.equal(switchedPath, "pi.jsonl");
  assert.equal(engine.turns[0].assistantMessage, "answer");
  assert.ok(statuses.includes("Resumed pi session: pi-start"));

  const legacyEngine = new ContextEngine({ cwd: dir, modelId: "test", provider: "deepseek", skills: [], pins: [] });
  let restoredLegacy = false;
  legacyEngine.restoreSession = () => {
    restoredLegacy = true;
  };
  const legacy = await resumeStartupSession({
    resumeId: "old",
    usePiSessionDefaults: false,
    runner: { engine: legacyEngine },
    sessionState: { sessionId: "old", sessionDir: "legacy-dir" },
    projectMarchDir,
    ui,
    loadLegacySession: () => ({ turns: [1, 2] }),
  });
  assert.equal(legacy.source, "legacy");
  assert.equal(restoredLegacy, true);
  assert.ok(statuses.includes("Resumed legacy session old (2 turns)"));
  cleanup(dir);
  console.log("  PASS");
}
