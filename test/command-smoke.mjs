import { strict as assert } from "node:assert";

export async function runSelectorListSmoke() {
  console.log("--- smoke: selector list formatting ---");
  const { findCurrentIndex, formatSelectorList } = await import("../src/cli/selector-list.mjs");
  const items = [{ id: "a" }, { id: "b" }];
  assert.equal(findCurrentIndex(items, (item) => item.id === "b"), 1);
  assert.deepEqual(formatSelectorList({
    items,
    currentIndex: 1,
    instruction: "Use /x <index> to select.",
    formatItem: (item) => item.id,
  }), [
    "  1. a",
    "* 2. b",
    "Use /x <index> to select.",
  ]);
  assert.deepEqual(formatSelectorList({ items: [], emptyMessage: "(empty)" }), ["(empty)"]);
  console.log("  PASS");
}

export async function runModelCommandSmoke() {
  console.log("--- smoke: model command handling ---");
  const {
    buildModelSelectItems,
    cycleModel,
    formatModelsList,
    handleModelCommand,
    listModels,
    parseModelCommand,
    selectModelByIndex,
  } = await import("../src/cli/model-command.mjs");
  const models = [
    { model: { id: "a", name: "Model A", provider: "test" } },
    { model: { id: "b", provider: "test" } },
  ];
  assert.deepEqual(formatModelsList({ current: models[0].model, scopedModels: models }), [
    "Current: Model A (test)",
    " * 1. Model A (test)",
    "   2. b (test)",
    "Use /model <index> to select.",
  ]);
  assert.deepEqual(buildModelSelectItems({ current: models[0].model, scopedModels: models }), [
    { value: "0", label: "Model A", description: "test  current", model: models[0].model },
    { value: "1", label: "b", description: "test", model: models[1].model },
  ]);
  assert.deepEqual(formatModelsList({ current: null, scopedModels: [] }), [
    "(no scoped models - use --model flag or /model to cycle)",
  ]);
  assert.deepEqual(parseModelCommand("hello"), { type: "none" });
  assert.deepEqual(parseModelCommand("/model"), { type: "cycle" });
  assert.deepEqual(parseModelCommand("/model 2"), { type: "select", index: 2 });
  assert.equal(parseModelCommand("/model nope").type, "error");

  let selectedModel = null;
  const runner = {
    cycleModel: async () => ({ model: models[1].model, thinkingLevel: "high" }),
    getCurrentModel: () => models[0].model,
    getScopedModels: () => models,
    setModel: async (model) => {
      selectedModel = model;
      return model;
    },
  };
  assert.equal(await cycleModel({ runner }), "Model: b (test)  thinking: high");
  assert.equal(await selectModelByIndex(2, { runner }), "Model: b (test)");
  assert.equal(selectedModel.id, "b");
  assert.equal(await selectModelByIndex(3, { runner }), "Error: model index out of range: 3");
  assert.equal(await handleModelCommand({ type: "select", index: 1 }, { runner }), "Model: Model A (test)");
  assert.ok(listModels({ runner }).join("\n").includes("Model A"));
  console.log("  PASS");
}
