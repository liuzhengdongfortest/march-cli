import { strict as assert } from "node:assert";

export async function runRuntimeHostSmoke() {
  console.log("--- smoke: runtime host rebind ---");
  const { createRuntimeHost } = await import("../src/agent/runtime-host.mjs");
  const { createSessionBinding } = await import("../src/agent/session-binding.mjs");

  const calls = [];
  let rebindSession = null;
  const runtime = {
    session: { id: "initial" },
    diagnostics: [{ type: "warning", message: "extension warning" }],
    setRebindSession(callback) {
      rebindSession = callback;
    },
    async switchSession(sessionPath) {
      calls.push(`switch:${sessionPath}`);
      this.session = { id: "switched", sessionPath };
      await rebindSession(this.session);
      return { cancelled: false };
    },
    async newSession() {
      calls.push("new");
      this.session = { id: "new" };
      await rebindSession(this.session);
      return { cancelled: false };
    },
    async fork(entryId, options) {
      calls.push(`fork:${entryId}:${options.position}`);
      this.session = { id: "forked", entryId };
      await rebindSession(this.session);
      return { cancelled: false };
    },
    async dispose() {
      calls.push("dispose");
    },
  };

  const rebound = [];
  const binding = createSessionBinding({ id: "stale" });
  const host = createRuntimeHost({
    runtime,
    sessionBinding: binding,
    onRebind: (session) => rebound.push(session.id),
  });

  assert.equal(host.getSession().id, "initial");
  assert.deepEqual(host.getDiagnostics(), [{ type: "warning", message: "extension warning" }]);
  assert.equal(binding.get().id, "initial");
  assert.equal((await host.switchSession("target.jsonl")).cancelled, false);
  assert.equal(host.getSession().id, "switched");
  assert.deepEqual(rebound, ["switched"]);
  assert.equal((await host.newSession()).cancelled, false);
  assert.equal(binding.get().id, "new");
  assert.deepEqual(rebound, ["switched", "new"]);
  assert.equal((await host.fork("leaf-1", { position: "at" })).cancelled, false);
  assert.equal(binding.get().id, "forked");
  assert.deepEqual(rebound, ["switched", "new", "forked"]);
  await host.dispose();
  assert.deepEqual(calls, ["switch:target.jsonl", "new", "fork:leaf-1:at", "dispose"]);
  console.log("  PASS");
}
