import { strict as assert } from "node:assert";

export async function runSessionOptionsSmoke() {
  console.log("--- smoke: runner session options ---");
  const { resolveRunnerSessionOptions } = await import("../src/agent/session-options.mjs");

  const model = { id: "fake-model" };
  const options = resolveRunnerSessionOptions({
    cwd: "D:/repo",
    provider: "test",
    modelId: "model",
    modelRegistry: { find: (provider, modelId) => (provider === "test" && modelId === "model" ? model : null) },
    engine: { cwd: "D:/repo" },
    ui: { editDiff: () => {} },
    memoryTools: [{ name: "remember" }],
    skillTools: [{ name: "skill_lookup" }],
  });

  assert.equal(options.model, model);
  assert.equal(options.thinkingLevel, "medium");
  assert.ok(options.customTools.some((tool) => tool.name === "open_file"));
  assert.ok(options.customTools.some((tool) => tool.name === "remember"));
  assert.deepEqual(options.tools.slice(0, 7), ["read", "bash", "edit", "write", "grep", "find", "ls"]);
  assert.ok(options.tools.includes("open_file"));
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
