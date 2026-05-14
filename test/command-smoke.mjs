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
    { model: { id: "b", provider: "other" } },
  ];
  assert.deepEqual(formatModelsList({ current: models[0].model, scopedModels: models }), [
    "Current: Model A (test)",
    "── other ──",
    "    b",
    "── test ──",
    "  ● Model A",
    "Use Ctrl+L or /model to choose a model.",
  ]);
  assert.deepEqual(buildModelSelectItems({ current: models[0].model, scopedModels: models }), [
    { value: "0", label: "test / Model A", description: "current", model: models[0].model },
    { value: "1", label: "other / b", description: "other", model: models[1].model },
  ]);
  assert.deepEqual(formatModelsList({ current: null, scopedModels: [] }), [
    "(no available models - run `march provider --config`)",
  ]);
  assert.deepEqual(parseModelCommand("hello"), { type: "none" });
  assert.deepEqual(parseModelCommand("/model"), { type: "select-interactive" });
  assert.equal(parseModelCommand("/model 2").type, "error");
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
  assert.equal(await cycleModel({ runner }), "Model: b (other)  thinking: high");
  assert.equal(await selectModelByIndex(2, { runner }), "Model: b (other)");
  assert.equal(selectedModel.id, "b");
  assert.equal(await selectModelByIndex(3, { runner }), "Error: model index out of range: 3");
  assert.equal(await handleModelCommand({ type: "select-interactive" }, { runner }), "Use Ctrl+L to choose a model.");
  assert.equal(await handleModelCommand({ type: "select-interactive" }, { runner, ui: { selectList: async ({ items }) => items[1] } }), "Model: b (other)");
  assert.ok(listModels({ runner }).join("\n").includes("Model A"));
  console.log("  PASS");
}
