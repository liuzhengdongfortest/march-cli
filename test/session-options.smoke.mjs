import { strict as assert } from "node:assert";

export async function runSessionOptionsSmoke() {
  console.log("--- smoke: runner session options ---");
  const { resolveRunnerSessionOptions } = await import("../src/agent/session/session-options.mjs");

  const model = { id: "fake-model" };
  const options = resolveRunnerSessionOptions({
    cwd: "D:/repo",
    provider: "test",
    modelId: "model",
    modelRegistry: { find: (provider, modelId) => (provider === "test" && modelId === "model" ? model : null), getAvailable: () => [model] },
    engine: { cwd: "D:/repo" },
    ui: { editDiff: () => {} },
    memoryTools: [{ name: "remember" }],
    skillTools: [{ name: "skill_lookup" }],
    shellRuntime: { listShells: () => [] },
  });

  assert.equal(options.model, model);
  assert.deepEqual(options.scopedModels, [{ model }]);
  assert.equal(options.thinkingLevel, "medium");
  assert.ok(options.customTools.some((tool) => tool.name === "terminal_list"));
  assert.ok(options.customTools.some((tool) => tool.name === "remember"));
  assert.deepEqual(options.tools.slice(0, 3), ["read", "grep", "ls"]);
  assert.ok(!options.tools.includes("bash"));
  assert.ok(!options.tools.includes("powershell"));
  assert.ok(!options.tools.includes("edit"));
  assert.ok(!options.tools.includes("write"));
  assert.ok(options.tools.includes("find"));
  assert.ok(options.tools.includes("command_exec"));
  assert.ok(options.tools.includes("edit_file"));
  assert.ok(options.tools.includes("terminal_spawn"));
  assert.ok(options.tools.includes("terminal_snapshot"));
  assert.ok(options.tools.includes("remember"));
  assert.ok(options.tools.includes("skill_lookup"));

  assert.throws(
    () => resolveRunnerSessionOptions({
      cwd: "D:/other",
      provider: "test",
      modelId: "model",
      modelRegistry: { find: () => model },
      engine: { cwd: "D:/repo" },
      ui: { editDiff: () => {} },
    }),
    /cwd mismatch/,
  );
  console.log("  PASS");
}
