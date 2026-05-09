import { strict as assert } from "node:assert";

export async function runModelCommandSmoke() {
  console.log("--- smoke: model command handling ---");
  const {
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

export async function runSessionCommandSmoke() {
  console.log("--- smoke: session command handling ---");
  const { compactSession, formatSessionStats, listSessionStats } = await import("../src/cli/session-command.mjs");
  const stats = {
    sessionId: "s1",
    userMessages: 2,
    assistantMessages: 3,
    toolCalls: 4,
    totalMessages: 9,
    tokens: { input: 10, output: 20, cacheRead: 3, cacheWrite: 4 },
    cost: 0.12345,
  };
  assert.deepEqual(formatSessionStats(stats), [
    "session: s1",
    "messages: 2u + 3a + 4t = 9 total",
    "tokens: 10 in / 20 out (3 cache read, 4 cache write)",
    "cost: $0.1235",
  ]);
  const runner = {
    compact: async () => ({ summary: "hello" }),
    getSessionStats: () => stats,
  };
  assert.deepEqual(await compactSession({ runner }), ["Compacted: 5 char summary"]);
  assert.equal(listSessionStats({ runner })[0], "session: s1");
  console.log("  PASS");
}

export async function runSessionListCommandSmoke() {
  console.log("--- smoke: session list command handling ---");
  const { formatSessionList, listSessionCommand } = await import("../src/cli/session-list-command.mjs");
  const sessions = [
    {
      id: "root",
      savedAt: "2026-05-10T00:00:00.000Z",
      turnCount: 2,
      cwd: "D:/repo",
      parentSessionId: null,
    },
    {
      id: "child",
      savedAt: "2026-05-10T00:01:00.000Z",
      turnCount: 3,
      cwd: "D:/repo",
      parentSessionId: "root",
    },
  ];
  assert.deepEqual(formatSessionList([], "root"), ["(no saved sessions)"]);
  const flat = formatSessionList(sessions, "child");
  assert.ok(flat.some((line) => line.includes("* child")));
  assert.ok(flat.some((line) => line.includes("fork:root")));
  const tree = listSessionCommand({ sessions, currentSessionId: "child", tree: true });
  assert.ok(tree.some((line) => line.startsWith("  * child")));
  console.log("  PASS");
}
