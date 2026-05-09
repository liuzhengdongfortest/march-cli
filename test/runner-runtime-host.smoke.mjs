import { strict as assert } from "node:assert";

export async function runRunnerRuntimeHostSmoke() {
  console.log("--- smoke: runner runtime host composition ---");
  const { createRunner } = await import("../src/agent/runner.mjs");
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
    extensionPaths: ["D:/repo/ext.ts"],
    createServices: async (options) => {
      calls.push(["services", options.cwd, options.agentDir, options.authStorage.id, options.resourceLoaderOptions.additionalExtensionPaths.join(",")]);
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
    ["services", "D:/repo", "D:/state", "auth", "D:/repo/ext.ts"],
    ["session", "D:/repo", "manager", true],
  ]);

  assert.equal((await host.newSession()).cancelled, false);
  assert.equal(binding.get().id, "new");
  await host.dispose();
  assert.deepEqual(calls.at(-1), ["dispose"]);

  process.env.TEST_API_KEY = "test";
  await assert.rejects(
    () => createRunner({
      cwd: "D:/repo",
      stateRoot: "D:/state",
      provider: "test",
      modelId: "model",
      ui: { editDiff: () => {} },
      skills: [],
      pins: [],
      extensionPaths: ["D:/repo/ext.ts"],
      useRuntimeHost: false,
      createAgentSessionImpl: async () => ({ session: { id: "unused" } }),
    }),
    /--extension requires the default pi runtime host path/,
  );
  console.log("  PASS");
}
