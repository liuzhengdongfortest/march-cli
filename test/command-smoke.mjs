import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    formatModelsList,
    handleModelCommand,
    listModels,
    persistModelSelection,
    parseModelCommand,
    selectModelByIndex,
  } = await import("../src/cli/commands/model-command.mjs");
  const configHomeDir = mkdtempSync(join(tmpdir(), "march-model-command-"));
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
    { value: "0", label: "Model A (test)", description: "current", model: models[0].model },
    { value: "1", label: "b (other)", description: "other", model: models[1].model },
  ]);
  assert.deepEqual(formatModelsList({ current: null, scopedModels: [] }), [
    "(no available models - run `march provider --config`)",
  ]);
  assert.deepEqual(parseModelCommand("hello"), { type: "none" });
  assert.deepEqual(parseModelCommand("/model"), { type: "select-interactive" });
  assert.equal(parseModelCommand("/model 2").type, "error");
  assert.equal(parseModelCommand("/model nope").type, "error");

  // Deduplication: same model id under different providers should show once
  const dupModels = [
    { model: { id: "grok-4.3", name: "Grok 4.3", provider: "supergrok-oauth" } },
    { model: { id: "grok-4.3", name: "Grok 4.3", provider: "xai-oauth" } },
    { model: { id: "grok-4.20", name: "Grok 4.20", provider: "supergrok-oauth" } },
  ];
  const dedupedItems = buildModelSelectItems({ current: null, scopedModels: dupModels });
  assert.equal(dedupedItems.length, 2, "Dedup should remove duplicate model ids");
  assert.equal(dedupedItems[0].model.provider, "supergrok-oauth", "Preferred provider supergrok-oauth wins");

  let selectedModel = null;
  const runner = {
    getCurrentModel: () => models[0].model,
    getScopedModels: () => models,
    setModel: async (model) => {
      selectedModel = model;
      return model;
    },
  };
  assert.equal(await selectModelByIndex(2, { runner }), "Model: b (other)");
  assert.equal(selectedModel.id, "b");
  assert.equal(await selectModelByIndex(3, { runner }), "Error: model index out of range: 3");
  try {
    assert.equal(await handleModelCommand({ type: "select-interactive" }, { runner }), "Use Ctrl+L to choose a model.");
    assert.equal(await handleModelCommand({ type: "select-interactive" }, { runner, ui: { selectList: async ({ items, anchor }) => {
      assert.equal(anchor, undefined);
      return items[1];
    } }, configHomeDir }), "Model: b (other)");
    const configPath = join(configHomeDir, ".march", "config.json");
    assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), { provider: "other", model: "b" });

    writeFileSync(configPath, JSON.stringify({ providers: { deepseek: { type: "deepseek" } }, webSearch: { provider: "brave" } }));
    persistModelSelection(models[0].model, { configHomeDir });
    const persisted = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(persisted.provider, "test");
    assert.equal(persisted.model, "a");
    assert.equal(persisted.providers.deepseek.type, "deepseek");
    assert.equal(persisted.webSearch.provider, "brave");
    assert.ok(listModels({ runner }).join("\n").includes("Model A"));
  } finally {
    if (existsSync(configHomeDir)) rmSync(configHomeDir, { recursive: true, force: true });
  }
  console.log("  PASS");
}
