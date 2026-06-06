import { strict as assert } from "node:assert";

export async function runSessionOptionsSmoke() {
  console.log("--- smoke: runner session options ---");
  const { resolveRunnerSessionOptions } = await import("../src/agent/session/session-options.mjs");
  const { createRunnerSessionBoundary } = await import("../src/agent/session/session-boundary.mjs");

  const model = { id: "fake-model" };
  const options = resolveRunnerSessionOptions(createRunnerSessionBoundary({
    core: {
      cwd: "D:/repo",
      provider: "test",
      modelId: "model",
      modelRegistry: { find: (provider, modelId) => (provider === "test" && modelId === "model" ? model : null), getAvailable: () => [model] },
      engine: { cwd: "D:/repo" },
      ui: { editDiff: () => {} },
    },
    capabilities: { memoryTools: [{ name: "remember" }] },
    infrastructure: { shellRuntime: { listShells: () => [] } },
  }));

  assert.equal(options.model, model);
  assert.deepEqual(options.scopedModels, [{ model }]);
  assert.equal(options.thinkingLevel, "medium");
  assert.ok(options.customTools.some((tool) => tool.name === "terminal_list"));
  assert.ok(options.customTools.some((tool) => tool.name === "remember"));
  assert.deepEqual(options.tools.slice(0, 4), ["read", "grep", "find", "ls"]);
  assert.ok(!options.tools.includes("bash"));
  assert.ok(!options.tools.includes("powershell"));
  assert.ok(!options.tools.includes("edit"));
  assert.ok(!options.tools.includes("write"));
  assert.ok(options.tools.includes("find"));
  assert.ok(options.tools.includes("command_exec"));
  assert.ok(options.tools.includes("edit_file"));
  assert.ok(options.tools.includes("terminal_spawn"));
  assert.ok(options.tools.includes("terminal_read"));
  assert.ok(options.tools.includes("terminal_snapshot"));
  assert.ok(options.tools.includes("remember"));

  const boundaryOptions = resolveRunnerSessionOptions(createRunnerSessionBoundary({
    core: {
      cwd: "D:/repo",
      provider: "test",
      modelId: "model",
      modelRegistry: { find: () => model, getAvailable: () => [model] },
      engine: { cwd: "D:/repo" },
      ui: { editDiff: () => {} },
    },
    capabilities: { memoryTools: [{ name: "boundary_memory" }] },
    infrastructure: { shellRuntime: { listShells: () => [] } },
  }));
  assert.ok(boundaryOptions.tools.includes("boundary_memory"));
  assert.ok(boundaryOptions.tools.includes("terminal_spawn"));

  assert.throws(
    () => resolveRunnerSessionOptions(createRunnerSessionBoundary({
      core: {
        cwd: "D:/other",
        provider: "test",
        modelId: "model",
        modelRegistry: { find: () => model },
        engine: { cwd: "D:/repo" },
        ui: { editDiff: () => {} },
      },
    })),
    /cwd mismatch/,
  );
  assert.throws(
    () => createRunnerSessionBoundary({ cwd: "D:/repo", engine: { cwd: "D:/repo" } }),
    /only accepts core\/capabilities\/infrastructure/,
  );
  console.log("  PASS");
}
