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
  assert.deepEqual(formatSessionStats({ ...stats, persisted: false, sessionFile: undefined }), [
    "session: s1",
    "persistence: in-memory",
    "messages: 2u + 3a + 4t = 9 total",
    "tokens: 10 in / 20 out (3 cache read, 4 cache write)",
    "cost: $0.1235",
  ]);
  assert.deepEqual(formatSessionStats({ ...stats, persisted: false, runtimeHost: false, piSessionSwitching: false }), [
    "session: s1",
    "persistence: in-memory",
    "runtime: direct-agent-session",
    "/resume-pi: requires --pi-runtime-host",
    "messages: 2u + 3a + 4t = 9 total",
    "tokens: 10 in / 20 out (3 cache read, 4 cache write)",
    "cost: $0.1235",
  ]);
  assert.ok(formatSessionStats({ ...stats, runtimeHost: true, piSessionSwitching: true }).includes("runtime: pi-runtime-host"));
  assert.ok(formatSessionStats({ ...stats, runtimeHost: true, piSessionSwitching: true }).includes("/resume-pi: available"));
  assert.ok(formatSessionStats({ ...stats, persisted: true, sessionFile: "session.jsonl" }).includes("persistence: pi-jsonl (session.jsonl)"));
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
  const { formatPiSessionList, formatSessionList, listSessionCommand } = await import("../src/cli/session-list-command.mjs");
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
  assert.deepEqual(formatPiSessionList([]), ["(no pi sessions)"]);
  assert.ok(formatPiSessionList([{
    id: "pi1",
    savedAt: "2026-05-10T00:00:00.000Z",
    turnCount: 2,
    firstMessage: "hello pi",
  }]).some((line) => line.includes("pi1") && line.includes("hello pi")));
  console.log("  PASS");
}

export async function runSessionSwitchCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: session switch command handling ---");
  const { mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const { parseResumeCommand, resumeSessionById } = await import("../src/cli/session-switch-command.mjs");
  const { saveSession } = await import("../src/session/persist.mjs");

  assert.deepEqual(parseResumeCommand("hello"), { type: "none" });
  assert.deepEqual(parseResumeCommand("/resume target"), { type: "resume", id: "target" });
  assert.equal(parseResumeCommand("/resume").type, "error");
  assert.equal(parseResumeCommand("/resume ../bad").type, "error");

  const dir = setupTmp();
  const sessionsRoot = join(dir, "sessions");
  mkdirSync(sessionsRoot, { recursive: true });

  const currentEngine = new ContextEngine({ cwd: dir, modelId: "test", provider: "deepseek", skills: [], pins: [] });
  currentEngine.recordTurn({ userMessage: "current", summary: "current" });
  const targetEngine = new ContextEngine({ cwd: dir, modelId: "test", provider: "deepseek", skills: [], pins: ["/target.txt"] });
  targetEngine.recordTurn({ userMessage: "target", summary: "target" });
  saveSession(join(sessionsRoot, "target"), targetEngine);

  const runner = { engine: currentEngine };
  const sessionState = { sessionId: "current", sessionDir: join(sessionsRoot, "current") };
  const lines = resumeSessionById("target", { runner, sessionState, sessionsRoot });
  assert.deepEqual(lines, ["Resumed session: target (1 turns)"]);
  assert.equal(sessionState.sessionId, "target");
  assert.equal(runner.engine.turns[0].userMessage, "target");
  assert.deepEqual(runner.engine.getPins(), ["/target.txt"]);

  cleanup(dir);
  console.log("  PASS");
}

export async function runPiSessionSwitchCommandSmoke() {
  console.log("--- smoke: pi session switch command handling ---");
  const { parseResumePiCommand, resumePiSessionById } = await import("../src/cli/pi-session-switch-command.mjs");

  assert.deepEqual(parseResumePiCommand("hello"), { type: "none" });
  assert.deepEqual(parseResumePiCommand("/resume-piabc"), { type: "none" });
  assert.deepEqual(parseResumePiCommand("/resume-pi abc"), { type: "resume-pi", id: "abc" });
  assert.equal(parseResumePiCommand("/resume-pi").type, "error");
  assert.equal(parseResumePiCommand("/resume-pi ../bad").type, "error");

  const sessions = [
    { id: "abc123", path: "abc.jsonl" },
    { id: "def456", path: "def.jsonl" },
  ];
  const disabled = { canSwitchPiSession: () => false };
  assert.deepEqual(await resumePiSessionById("abc", { runner: disabled, sessions }), [
    "Error: /resume-pi requires --pi-runtime-host",
  ]);

  let switchedPath = null;
  const runner = {
    canSwitchPiSession: () => true,
    switchPiSession: async (path) => {
      switchedPath = path;
      return { cancelled: false };
    },
  };
  assert.deepEqual(await resumePiSessionById("abc", { runner, sessions }), ["Resumed pi session: abc123"]);
  assert.equal(switchedPath, "abc.jsonl");
  assert.deepEqual(await resumePiSessionById("missing", { runner, sessions }), ["Error: pi session not found: missing"]);
  assert.deepEqual(await resumePiSessionById("a", { runner, sessions: [{ id: "aa", path: "1" }, { id: "ab", path: "2" }] }), [
    "Error: pi session id is ambiguous: a (aa, ab)",
  ]);
  assert.deepEqual(await resumePiSessionById("def", {
    runner: { canSwitchPiSession: () => true, switchPiSession: async () => ({ cancelled: true }) },
    sessions,
  }), ["Resume pi session cancelled: def456"]);
  console.log("  PASS");
}
