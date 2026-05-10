import { strict as assert } from "node:assert";

export async function runRunnerCoreSmoke() {
  console.log("--- smoke: March tool set ---");
  const { MARCH_BASE_TOOL_NAMES, createDefaultSessionManager, createRunner, resolveRunnerSessionManager, syncEngineSessionState } = await import("../src/agent/runner.mjs");
  const { createSessionBinding } = await import("../src/agent/session-binding.mjs");
  const { ContextEngine } = await import("../src/context/engine.mjs");

  assert.deepEqual(MARCH_BASE_TOOL_NAMES, ["read", "bash", "edit", "write", "grep", "find", "ls"]);
  console.log("  PASS");

  console.log("--- smoke: runner session manager seam ---");
  const manager = createDefaultSessionManager(process.cwd());
  assert.equal(manager.getCwd(), process.cwd());
  assert.equal(manager.isPersisted(), false);
  const injected = { id: "injected" };
  assert.equal(resolveRunnerSessionManager(process.cwd(), injected), injected);
  const binding = createSessionBinding({ id: "s1" });
  assert.equal(binding.get().id, "s1");
  assert.equal(binding.set({ id: "s2" }).id, "s2");
  assert.equal(binding.get().id, "s2");
  const engine = new ContextEngine({ cwd: process.cwd(), modelId: "old", provider: "deepseek", thinkingLevel: "low" });
  syncEngineSessionState(engine, {
    model: { id: "new", provider: "test" },
    thinkingLevel: "high",
    getActiveToolNames: () => ["read"],
    getToolDefinition: () => ({ description: "Read file", parameters: { properties: { path: { description: "Path" } } } }),
  });
  assert.equal(engine.modelId, "new");
  assert.equal(engine.provider, "test");
  assert.equal(engine.thinkingLevel, "high");
  assert.ok(engine.buildContext("").includes("thinking: high"));
  console.log("  PASS");

  console.log("--- smoke: runner missing credentials message ---");
  await assert.rejects(
    () => createRunner({
      cwd: process.cwd(),
      modelId: "missing-model",
      provider: "missing-provider-smoke",
      stateRoot: process.cwd(),
      ui: {},
      skills: [],
      pins: [],
    }),
    /No credentials configured for missing-provider-smoke\. Set MISSING_PROVIDER_SMOKE_API_KEY or run: march login missing-provider-smoke\./,
  );
  console.log("  PASS");
}
