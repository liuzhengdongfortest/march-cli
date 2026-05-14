import { strict as assert } from "node:assert";

export async function runPiSessionCloneCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: pi session clone command handling ---");
  const { cloneCurrentPiSession } = await import("../src/agent/pi-session/pi-session-clone.mjs");
  const { createSessionBinding } = await import("../src/agent/session/session-binding.mjs");
  const { clonePiSession, parseClonePiCommand } = await import("../src/cli/session/pi-session-clone-command.mjs");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const { loadPiSessionSidecar } = await import("../src/session/sidecar.mjs");

  assert.deepEqual(parseClonePiCommand("hello"), { type: "none" });
  assert.deepEqual(parseClonePiCommand("/clone-piabc"), { type: "none" });
  assert.deepEqual(parseClonePiCommand("/clone-pi"), { type: "clone-pi" });
  assert.equal(parseClonePiCommand("/clone-pi extra").type, "error");
  assert.deepEqual(await clonePiSession({ runner: { canSwitchPiSession: () => false } }), [
    "Error: /clone-pi requires the pi runtime host",
  ]);
  assert.deepEqual(await clonePiSession({
    runner: {
      canSwitchPiSession: () => true,
      clonePiSession: async () => ({ cancelled: false, sessionId: "new", sourceSessionId: "old" }),
    },
  }), ["Cloned pi session: new (from: old)"]);
  assert.deepEqual(await clonePiSession({
    runner: {
      canSwitchPiSession: () => true,
      clonePiSession: async () => ({ cancelled: true, sourceSessionId: "old" }),
    },
  }), ["Clone pi session cancelled: old"]);

  const dir = setupTmp();
  const projectMarchDir = `${dir}/.march`;
  const engine = new ContextEngine({ cwd: dir, modelId: "test", provider: "deepseek", skills: ["s1"], pins: ["pinned"], namespace: "ns" });
  engine.recordTurn({ userMessage: "u", summary: "s" });
  let activeSession = {
    sessionManager: { getLeafId: () => "leaf-1" },
    getSessionStats: () => ({ sessionId: "old", sessionFile: "old.jsonl" }),
  };
  const binding = createSessionBinding(activeSession);
  const runtimeHost = {
    async fork(entryId, options) {
      assert.equal(entryId, "leaf-1");
      assert.deepEqual(options, { position: "at" });
      activeSession = {
        sessionManager: { getLeafId: () => "leaf-2" },
        getSessionStats: () => ({ sessionId: "new", sessionFile: "new.jsonl" }),
      };
      binding.set(activeSession);
      return { cancelled: false };
    },
  };
  const result = await cloneCurrentPiSession({
    runtimeHost,
    sessionBinding: binding,
    engine,
    projectMarchDir,
    getSessionStats: (session) => ({
      ...session.getSessionStats(),
      persisted: true,
      runtimeHost: true,
    }),
    now: () => new Date("2026-05-10T00:00:00.000Z"),
  });
  assert.equal(result.sessionId, "new");
  const sidecar = loadPiSessionSidecar({ projectMarchDir, sessionRef: "new.jsonl" });
  assert.equal(sidecar.state.derivedBy, "clone");
  assert.equal(sidecar.state.derivedAt, "2026-05-10T00:00:00.000Z");
  assert.equal(sidecar.state.derivedFromPiSessionId, "old");
  assert.equal(sidecar.state.derivedFromPiSessionFile, "old.jsonl");
  assert.equal(sidecar.state.turns[0].summary, "s");

  let rolledBackTo = null;
  const rollbackSource = {
    sessionManager: { getLeafId: () => "leaf-rollback" },
    getSessionStats: () => ({ sessionId: "old-rollback", sessionFile: "old-rollback.jsonl" }),
  };
  const rollbackBinding = createSessionBinding(rollbackSource);
  await assert.rejects(() => cloneCurrentPiSession({
    runtimeHost: {
      async fork() {
        rollbackBinding.set({
          sessionManager: { getLeafId: () => "new-rollback-leaf" },
          getSessionStats: () => ({ sessionId: "new-rollback", sessionFile: "new-rollback.jsonl" }),
        });
        return { cancelled: false };
      },
      async switchSession(sessionFile) {
        rolledBackTo = sessionFile;
        rollbackBinding.set(rollbackSource);
        return { cancelled: false };
      },
    },
    sessionBinding: rollbackBinding,
    engine,
    projectMarchDir: null,
    getSessionStats: (session) => ({
      ...session.getSessionStats(),
      persisted: true,
      runtimeHost: true,
    }),
  }), /failed to write pi session sidecar after clone: sidecar sync skipped; rolled back to source session/);
  assert.equal(rolledBackTo, "old-rollback.jsonl");
  assert.equal(rollbackBinding.get().getSessionStats().sessionId, "old-rollback");

  await assert.rejects(() => cloneCurrentPiSession({
    runtimeHost,
    sessionBinding: createSessionBinding({
      sessionManager: { getLeafId: () => null },
      getSessionStats: () => ({ sessionId: "empty", sessionFile: "empty.jsonl" }),
    }),
    engine,
    projectMarchDir,
    getSessionStats: (session) => ({ ...session.getSessionStats(), persisted: true }),
  }), /no active leaf/);
  cleanup(dir);
  console.log("  PASS");
}
