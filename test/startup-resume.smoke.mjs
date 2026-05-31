import { strict as assert } from "node:assert";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

export async function runStartupResumeSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: startup resume source routing ---");
  const { loadOrCreateProjectId, resumeStartupSession } = await import("../src/cli/startup/startup-session.mjs");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const { savePiSessionSidecar } = await import("../src/session/sidecar.mjs");
  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  const piSessionDir = join(projectMarchDir, "pi-sessions");
  const piSessionPath = join(piSessionDir, "pi.jsonl");
  mkdirSync(piSessionDir, { recursive: true });
  writeFileSync(piSessionPath, [
    JSON.stringify({ type: "session", version: 3, id: "pi-start", timestamp: "2026-05-10T00:00:00.000Z", cwd: dir }),
    JSON.stringify({ type: "message", id: "u1", parentId: null, timestamp: "2026-05-10T00:00:01.000Z", message: { role: "user", content: "hello", timestamp: 1778342401000 } }),
    JSON.stringify({ type: "message", id: "a1", parentId: "u1", timestamp: "2026-05-10T00:00:02.000Z", message: { role: "assistant", content: [{ type: "text", text: "answer" }], provider: "test", model: "test", timestamp: 1778342402000 } }),
    "",
  ].join("\n"));
  const projectId = loadOrCreateProjectId(projectMarchDir);
  assert.equal(loadOrCreateProjectId(projectMarchDir), projectId);
  const statuses = [];
  const ui = { status: (line) => statuses.push(line) };
  const engine = new ContextEngine({ cwd: dir, modelId: "test", provider: "deepseek" });
  const sourceEngine = new ContextEngine({ cwd: dir, modelId: "test", provider: "deepseek" });
  sourceEngine.recordTurn({ userMessage: "hello", assistantMessage: "answer" });
  savePiSessionSidecar({
    projectMarchDir,
    sessionRef: piSessionPath,
    engine: sourceEngine,
    metadata: { sessionId: "pi-start", sessionFile: piSessionPath },
  });
  let switchedPath = null;
  const runner = {
    canSwitchPiSession: () => true,
    engine,
    switchPiSession: async (path, restoreState) => {
      switchedPath = path;
      engine.restoreSession(restoreState, null, { replace: true });
      return { cancelled: false };
    },
  };
  const result = await resumeStartupSession({
    resumeId: "pi",
    runner,
    sessionState: { sessionId: "new", sessionDir: "unused" },
    projectMarchDir,
    ui,
    listPiSessions: async () => [{ id: "pi-start", path: piSessionPath }],
  });
  assert.equal(result.source, "pi");
  assert.equal(switchedPath, piSessionPath);
  assert.equal(engine.turns[0].assistant.content, "answer");
  assert.equal(result.transcriptTurns[0].user.content, "hello");
  assert.equal(result.transcriptTurns[0].assistant.content, "answer");
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
