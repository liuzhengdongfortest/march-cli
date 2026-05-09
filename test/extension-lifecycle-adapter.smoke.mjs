import { strict as assert } from "node:assert";

export async function runExtensionLifecycleAdapterSmoke() {
  console.log("--- smoke: extension lifecycle adapter ---");
  const {
    createMarchLifecycleAdapter,
    evaluateMarchHookEffect,
  } = await import("../src/extensions/lifecycle-adapter.mjs");

  const activeSession = { id: "active" };
  const adapter = createMarchLifecycleAdapter({
    cwd: "D:/repo",
    projectMarchDir: "D:/repo/.march",
    extensionPaths: ["D:/repo/.march/extensions/a.js"],
    sessionBinding: { get: () => activeSession },
    engine: {
      modelId: "model",
      provider: "test",
      thinkingLevel: "medium",
      namespace: "ns",
      turns: [{ index: 1 }],
      _compactionSummary: "summary",
    },
    getSessionStats: () => ({
      sessionId: "s1",
      sessionFile: "D:/repo/.march/pi-sessions/s1.jsonl",
      persisted: true,
      runtimeHost: true,
    }),
    getRuntimeDiagnostics: () => [{ type: "warning", message: "runtime warning" }],
  });

  const state = adapter.getState();
  assert.equal(state.status, "read-only");
  assert.equal(state.registeredHookCount, 0);
  assert.equal(state.extensionPathCount, 1);
  assert.equal(state.facts.sessionId, "s1");
  assert.equal(state.facts.runtimeHost, true);
  assert.equal(state.facts.summaryHash.length, 12);
  assert.equal(state.layers.length, 3);
  assert.ok(state.policy.allowedEffects.includes("read-runtime-diagnostics"));
  assert.ok(state.policy.deniedEffects.includes("run-shell"));
  assert.ok(state.diagnostics.some((diagnostic) => diagnostic.message === "runtime warning"));
  assert.equal(adapter.getActiveSession().id, "active");
  assert.deepEqual(adapter.canExecute("read-runtime-diagnostics"), { allowed: true });
  assert.equal(adapter.canExecute("write-files").allowed, false);
  assert.equal(evaluateMarchHookEffect("unknown-effect").allowed, false);
  console.log("  PASS");
}
