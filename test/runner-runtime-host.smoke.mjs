import { strict as assert } from "node:assert";

export async function runRunnerRuntimeHostSmoke() {
  console.log("--- smoke: runner runtime host composition ---");
  const { createRunner } = await import("../src/agent/runner.mjs");
  const { createRunnerRuntimeHost } = await import("../src/agent/runtime/runner-runtime-host.mjs");
  const { createSessionBinding } = await import("../src/agent/session/session-binding.mjs");

  const calls = [];
  const rebound = [];
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
    onRebind: (session) => rebound.push(session.id),
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
  assert.deepEqual(host.getDiagnostics(), [{ type: "info", message: "ok" }]);
  assert.equal(binding.get().id, "initial");
  assert.deepEqual(rebound, ["initial"]);
  assert.deepEqual(calls, [
    ["runtime", "D:/repo", "D:/state", "manager"],
    ["services", "D:/repo", "D:/state", "auth", "D:/repo/ext.ts"],
    ["session", "D:/repo", "manager", true],
  ]);

  assert.equal((await host.newSession()).cancelled, false);
  assert.equal(binding.get().id, "new");
  assert.deepEqual(rebound, ["initial", "new"]);
  await host.dispose();
  assert.deepEqual(calls.at(-1), ["dispose"]);

  const dumpEntries = [];
  const dumpSidecars = [];
  const observedPayloads = [];
  const previousDumpDeepseekKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = previousDumpDeepseekKey || "test-key";
  const dumpRunner = await createRunner({
    cwd: "D:/repo",
    stateRoot: "D:/state",
    provider: "deepseek",
    modelId: "deepseek-v4-pro",
    ui: { editDiff: () => {} },
    skills: [],
    pins: [],
    useRuntimeHost: true,
    modelContextDumper: {
      enabled: true,
      dump: (entry) => {
        dumpEntries.push(entry);
        return "request.md";
      },
      dumpSidecar: (entry) => dumpSidecars.push(entry),
    },
    onModelPayload: (entry) => observedPayloads.push(entry),
    createRuntimeServices: async (options) => options,
    createRuntimeSessionFromServices: async () => ({
      session: {
        agent: {},
        model: { id: "deepseek-v4-pro", provider: "deepseek" },
        thinkingLevel: "medium",
        getActiveToolNames: () => [],
        getToolDefinition: () => null,
        getSessionStats: () => ({ tokens: {} }),
        dispose: () => {},
      },
    }),
    createAgentSessionRuntimeImpl: async (createRuntime, options) => {
      const result = await createRuntime({ cwd: options.cwd, sessionManager: options.sessionManager });
      return {
        session: result.session,
        setRebindSession() {},
        async dispose() {},
      };
    },
  });
  await dumpRunner.session.agent.onPayload({ messages: [{ role: "user", content: "hello" }] }, dumpRunner.session.model);
  assert.equal(dumpEntries.length, 1);
  assert.equal(observedPayloads.length, 1);
  assert.equal(observedPayloads[0].estimatedTokens, 2);
  assert.equal(dumpEntries[0].kind, "model");
  assert.equal(dumpSidecars[0].suffix, "payload");
  await dumpRunner.dispose();
  if (previousDumpDeepseekKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = previousDumpDeepseekKey;
  }

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

  const disposeCalls = [];
  let shellDisposed = false;
  const previousDeepseekKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = previousDeepseekKey || "test-key";
  const cleanupRunner = await createRunner({
    cwd: "D:/repo",
    stateRoot: "D:/state",
    provider: "deepseek",
    modelId: "deepseek-v4-pro",
    ui: { editDiff: () => {} },
    skills: [],
    pins: [],
    shellRuntime: {
      async dispose() {
        disposeCalls.push("shell-start");
        await Promise.resolve();
        shellDisposed = true;
        disposeCalls.push("shell-done");
      },
    },
    createAgentSessionImpl: async () => ({
      session: {
        model: { id: "deepseek-v4-pro", provider: "deepseek" },
        thinkingLevel: "medium",
        getActiveToolNames: () => [],
        getToolDefinition: () => null,
        getSessionStats: () => ({ tokens: {} }),
        dispose: () => disposeCalls.push("session"),
      },
    }),
  });
  const disposePromise = cleanupRunner.dispose();
  assert.equal(shellDisposed, false);
  await disposePromise;
  assert.equal(shellDisposed, true);
  assert.deepEqual(disposeCalls, ["session", "shell-start", "shell-done"]);

  const failureCalls = [];
  const failingCleanupRunner = await createRunner({
    cwd: "D:/repo",
    stateRoot: "D:/state",
    provider: "deepseek",
    modelId: "deepseek-v4-pro",
    ui: { editDiff: () => {} },
    skills: [],
    pins: [],
    shellRuntime: {
      dispose() {
        failureCalls.push("shell");
        throw new Error("shell cleanup failed");
      },
    },
    createAgentSessionImpl: async () => ({
      session: {
        model: { id: "deepseek-v4-pro", provider: "deepseek" },
        thinkingLevel: "medium",
        getActiveToolNames: () => [],
        getToolDefinition: () => null,
        getSessionStats: () => ({ tokens: {} }),
        dispose: () => failureCalls.push("session"),
      },
    }),
  });
  await assert.rejects(() => failingCleanupRunner.dispose(), /shell cleanup failed/);
  assert.deepEqual(failureCalls, ["session", "shell"]);
  if (previousDeepseekKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = previousDeepseekKey;
  }
  console.log("  PASS");
}
