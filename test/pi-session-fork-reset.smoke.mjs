import { strict as assert } from "node:assert";

export async function runPiSessionForkResetSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: pi session fork reset ---");
  const { forkPiSessionWithResetContext } = await import("../src/agent/pi-session-fork-reset.mjs");
  const { createSessionBinding } = await import("../src/agent/session-binding.mjs");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const { loadPiSessionSidecar } = await import("../src/session/sidecar.mjs");

  const dir = setupTmp();
  const projectMarchDir = `${dir}/.march`;
  const engine = new ContextEngine({ cwd: dir, modelId: "test", provider: "deepseek", skills: ["s1"], pins: ["pinned"], namespace: "ns" });
  engine.recordTurn({ userMessage: "current", summary: "current" });
  let activeSession = {
    getUserMessagesForForking: () => [{ entryId: "u1", text: "old prompt" }],
    getSessionStats: () => ({ sessionId: "old", sessionFile: "old.jsonl" }),
  };
  const binding = createSessionBinding(activeSession);
  const runtimeHost = {
    async fork(entryId, options) {
      assert.equal(entryId, "u1");
      assert.deepEqual(options, { position: "before" });
      activeSession = {
        getUserMessagesForForking: () => [],
        getSessionStats: () => ({ sessionId: "new", sessionFile: "new.jsonl" }),
      };
      binding.set(activeSession);
      return { cancelled: false, selectedText: "old prompt" };
    },
  };

  const result = await forkPiSessionWithResetContext({
    runtimeHost,
    sessionBinding: binding,
    engine,
    projectMarchDir,
    entryId: "u1",
    getSessionStats: (session) => ({
      ...session.getSessionStats(),
      persisted: true,
      runtimeHost: true,
    }),
    now: () => new Date("2026-05-10T00:00:00.000Z"),
  });
  assert.equal(result.sessionId, "new");
  assert.equal(result.selectedText, "old prompt");
  assert.equal(engine.turns.length, 0);
  assert.deepEqual(engine.getPins(), []);
  assert.deepEqual(engine.skills, []);

  const sidecar = loadPiSessionSidecar({ projectMarchDir, sessionRef: "new.jsonl" });
  assert.equal(sidecar.state.derivedBy, "fork-reset");
  assert.equal(sidecar.state.sidecarMode, "reset-context");
  assert.equal(sidecar.state.derivedFromPiSessionId, "old");
  assert.equal(sidecar.state.derivedFromPiSessionFile, "old.jsonl");
  assert.equal(sidecar.state.derivedFromPiEntryId, "u1");
  assert.deepEqual(sidecar.state.turns, []);
  assert.deepEqual(sidecar.state.pins, []);
  assert.deepEqual(sidecar.state.openFiles, []);
  assert.deepEqual(sidecar.state.skills, []);

  await assert.rejects(() => forkPiSessionWithResetContext({
    runtimeHost,
    sessionBinding: createSessionBinding({
      getUserMessagesForForking: () => [{ entryId: "u2", text: "other" }],
      getSessionStats: () => ({ sessionId: "old", sessionFile: "old.jsonl" }),
    }),
    engine,
    projectMarchDir,
    entryId: "missing",
    getSessionStats: (session) => ({ ...session.getSessionStats(), persisted: true }),
  }), /pi fork entry not found/);

  cleanup(dir);
  console.log("  PASS");
}
