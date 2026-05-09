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
    manifestHooks: [
      {
        id: "manifest-observer",
        kind: "march-agent-runtime:after-turn",
        effects: ["read-session-ref", "write-diagnostics"],
        sourcePath: "D:/repo/.march/extensions/a.march-hooks.json",
        description: "Observe turns.",
      },
      {
        id: "manifest-denied",
        kind: "march-agent-runtime:after-turn",
        effects: ["run-shell"],
        sourcePath: "D:/repo/.march/extensions/b.march-hooks.json",
      },
    ],
    manifestDiagnostics: [{ type: "warning", message: "manifest warning" }],
  });

  const state = adapter.getState();
  assert.equal(state.status, "read-only");
  assert.equal(state.registeredHookCount, 1);
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

  adapter.registerHook({
    id: "observe-runtime",
    kind: "march-agent-runtime:after-turn",
    effects: ["read-runtime-diagnostics", "write-diagnostics"],
    handler: ({ facts, payload, canExecute }) => {
      assert.equal(facts.sessionId, "s1");
      assert.equal(payload.turnId, "t1");
      assert.equal(canExecute("write-files").allowed, false);
      return "observed";
    },
  });
  assert.equal(adapter.getState().registeredHookCount, 2);
  assert.deepEqual(adapter.getState().hookKinds, ["march-agent-runtime:after-turn"]);
  const observed = await adapter.runHook("march-agent-runtime:after-turn", { turnId: "t1" });
  assert.equal(observed.find((result) => result.id === "observe-runtime").value, "observed");
  assert.equal(observed.find((result) => result.id === "manifest-observer").value.description, "Observe turns.");
  assert.ok(adapter.getState().diagnostics.some((diagnostic) => diagnostic.message === "manifest warning"));
  assert.ok(adapter.getState().diagnostics.some((diagnostic) => diagnostic.message.includes("manifest-denied")));

  assert.throws(
    () => adapter.registerHook({
      id: "bad-write",
      kind: "march-agent-runtime:after-turn",
      effects: ["write-files"],
      handler: () => {},
    }),
    /cannot write-files/,
  );

  adapter.registerHook({
    id: "non-blocking-failure",
    kind: "march-agent-runtime:after-turn",
    effects: ["write-diagnostics"],
    handler: () => {
      throw new Error("diagnostic only");
    },
  });
  const failed = await adapter.runHook("march-agent-runtime:after-turn", { turnId: "t2" });
  assert.equal(failed.at(-1).ok, false);
  assert.ok(adapter.getState().diagnostics.some((diagnostic) => diagnostic.message.includes("diagnostic only")));

  adapter.registerHook({
    id: "blocking-failure",
    kind: "march-agent-runtime:blocking",
    effects: ["write-diagnostics"],
    blocking: true,
    handler: () => {
      throw new Error("stop");
    },
  });
  await assert.rejects(
    () => adapter.runHook("march-agent-runtime:blocking"),
    /stop/,
  );

  assert.equal(adapter.unregisterHook("observe-runtime"), true);
  console.log("  PASS");
}
