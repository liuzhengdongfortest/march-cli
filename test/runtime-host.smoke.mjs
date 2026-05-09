import { strict as assert } from "node:assert";

export async function runRuntimeHostSmoke() {
  console.log("--- smoke: runtime host rebind ---");
  const { createRuntimeHost } = await import("../src/agent/runtime-host.mjs");
  const { createSessionBinding } = await import("../src/agent/session-binding.mjs");

  const calls = [];
  let rebindSession = null;
  const runtime = {
    session: { id: "initial" },
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
  assert.equal(binding.get().id, "initial");
  assert.equal((await host.switchSession("target.jsonl")).cancelled, false);
  assert.equal(host.getSession().id, "switched");
  assert.deepEqual(rebound, ["switched"]);
  assert.equal((await host.newSession()).cancelled, false);
  assert.equal(binding.get().id, "new");
  assert.deepEqual(rebound, ["switched", "new"]);
  await host.dispose();
  assert.deepEqual(calls, ["switch:target.jsonl", "new", "dispose"]);
  console.log("  PASS");
}
