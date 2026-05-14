import { strict as assert } from "node:assert";

export async function runRuntimeFactorySmoke() {
  console.log("--- smoke: runtime factory builder ---");
  const { createMarchRuntimeFactory } = await import("../src/agent/runtime/runtime-factory.mjs");
  assert.throws(() => createMarchRuntimeFactory({}), /resolveSessionOptions/);

  const calls = [];
  const factory = createMarchRuntimeFactory({
    agentDir: "agent-dir",
    authStorage: { id: "auth" },
    settingsManager: { id: "settings" },
    modelRegistry: { id: "registry" },
    resourceLoaderOptions: { additionalExtensionPaths: ["D:/repo/ext.ts"] },
    createServices: async (options) => {
      calls.push(["services", options.cwd, options.agentDir, options.authStorage.id, options.resourceLoaderOptions.additionalExtensionPaths.join(",")]);
      return { cwd: options.cwd, agentDir: options.agentDir, diagnostics: [{ type: "info", message: "ok" }] };
    },
    resolveSessionOptions: async ({ cwd, services }) => {
      calls.push(["options", cwd, services.agentDir]);
      return { model: { id: "model" }, thinkingLevel: "medium", tools: ["read"], customTools: [{ name: "custom" }] };
    },
    createFromServices: async (options) => {
      calls.push(["session", options.services.cwd, options.sessionManager.id, options.sessionStartEvent.type, options.tools.join(",")]);
      return { session: { id: "created" }, modelFallbackMessage: "fallback" };
    },
  });

  const result = await factory({
    cwd: "D:/repo",
    sessionManager: { id: "manager" },
    sessionStartEvent: { type: "session_start" },
  });

  assert.equal(result.session.id, "created");
  assert.equal(result.services.cwd, "D:/repo");
  assert.deepEqual(result.diagnostics, [{ type: "info", message: "ok" }]);
  assert.deepEqual(calls, [
    ["services", "D:/repo", "agent-dir", "auth", "D:/repo/ext.ts"],
    ["options", "D:/repo", "agent-dir"],
    ["session", "D:/repo", "manager", "session_start", "read"],
  ]);
  console.log("  PASS");
}
