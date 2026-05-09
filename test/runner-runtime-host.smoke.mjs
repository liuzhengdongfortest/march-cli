import { strict as assert } from "node:assert";

export async function runRunnerRuntimeHostSmoke() {
  console.log("--- smoke: runner runtime host composition ---");
  const { createRunnerRuntimeHost } = await import("../src/agent/runner-runtime-host.mjs");
  const { createSessionBinding } = await import("../src/agent/session-binding.mjs");

  const calls = [];
  let rebindSession = null;
  const model = { id: "model" };
  const modelRegistry = { find: () => model };
  const sessionManager = { id: "manager" };
  const binding = createSessionBinding({ id: "stale" });

  const host = await createRunnerRuntimeHost({
    cwd: "D:/repo",
    stateRoot: "D:/state",
    provider: "test",
    modelId: "model",
    authStorage: { id: "auth" },
    settingsManager: { id: "settings" },
    modelRegistry,
    sessionManager,
    sessionBinding: binding,
    engine: { cwd: "D:/repo" },
    ui: { editDiff: () => {} },
    memoryTools: [{ name: "remember" }],
    createServices: async (options) => {
      calls.push(["services", options.cwd, options.agentDir, options.authStorage.id]);
      return { ...options, diagnostics: [{ type: "info", message: "ok" }] };
    },
    createFromServices: async (options) => {
      calls.push(["session", options.services.cwd, options.sessionManager.id, options.tools.includes("remember")]);
      return { session: { id: "initial", getActiveToolNames: () => options.tools } };
    },
    createAgentSessionRuntimeImpl: async (createRuntime, options) => {
      calls.push(["runtime", options.cwd, options.agentDir, options.sessionManager.id]);
      const result = await createRuntime({
        cwd: options.cwd,
        sessionManager: options.sessionManager,
        sessionStartEvent: { type: "session_start" },
      });
      return {
        session: result.session,
        diagnostics: result.diagnostics,
        setRebindSession(callback) {
          rebindSession = callback;
        },
        async newSession() {
          this.session = { id: "new" };
          await rebindSession(this.session);
          return { cancelled: false };
        },
        async dispose() {
          calls.push(["dispose"]);
        },
      };
    },
  });

  assert.equal(host.getSession().id, "initial");
  assert.equal(binding.get().id, "initial");
  assert.deepEqual(calls, [
    ["runtime", "D:/repo", "D:/state", "manager"],
    ["services", "D:/repo", "D:/state", "auth"],
    ["session", "D:/repo", "manager", true],
  ]);

  assert.equal((await host.newSession()).cancelled, false);
  assert.equal(binding.get().id, "new");
  await host.dispose();
  assert.deepEqual(calls.at(-1), ["dispose"]);
  console.log("  PASS");
}
