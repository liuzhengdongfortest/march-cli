import { strict as assert } from "node:assert";

export async function runSessionCommandSmoke() {
  console.log("--- smoke: session command handling ---");
  const { formatSessionStats, listSessionStats } = await import("../src/cli/session/session-command.mjs");
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
    "messages: 2u + 3a + 4t = 9 total",
    "tokens: 10 in / 20 out (3 cache read, 4 cache write)",
    "cost: $0.1235",
  ]);
  assert.ok(formatSessionStats({ ...stats, runtimeHost: true, piSessionSwitching: true }).includes("runtime: pi-runtime-host"));
  assert.ok(!formatSessionStats({ ...stats, runtimeHost: true, piSessionSwitching: true }).join("\n").includes("/resume-pi"));
  assert.ok(formatSessionStats({ ...stats, persisted: true, sessionFile: "session.jsonl" }).includes("persistence: pi-jsonl (session.jsonl)"));
  const runner = {
    getSessionStats: () => stats,
  };
  assert.equal(listSessionStats({ runner })[0], "session: s1");
  console.log("  PASS");
}

export async function runSessionListCommandSmoke() {
  console.log("--- smoke: session list command handling ---");
  const { formatPiSessionList, formatPiSessionTree, formatSessionList, listSessionCommand } = await import("../src/cli/session/session-list-command.mjs");
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
  assert.ok(formatPiSessionList([{
    id: "pi1",
    savedAt: "2026-05-10T00:00:00.000Z",
    turnCount: 2,
    firstMessage: "hello pi",
  }]).some((line) => line.includes("/session") && line.includes("restore a previous session")));
  const piTree = formatPiSessionTree([
    {
      id: "parent",
      path: "parent.jsonl",
      savedAt: "2026-05-10T00:00:00.000Z",
      turnCount: 2,
      firstMessage: "parent message",
      parentSessionPath: null,
    },
    {
      id: "child",
      path: "child.jsonl",
      savedAt: "2026-05-10T00:01:00.000Z",
      turnCount: 3,
      firstMessage: "child message",
      parentSessionPath: "parent.jsonl",
    },
    {
      id: "orphan",
      path: "orphan.jsonl",
      savedAt: "2026-05-10T00:02:00.000Z",
      turnCount: 1,
      firstMessage: "orphan message",
      parentSessionPath: "missing.jsonl",
    },
  ], "child");
  assert.ok(piTree.some((line) => line.startsWith("- orphan")));
  assert.ok(piTree.some((line) => line.startsWith("- parent")));
  assert.ok(piTree.some((line) => line.startsWith("  * child")));
  assert.ok(piTree.at(-1).includes("file-level tree"));
  assert.ok(!piTree.at(-1).includes("/fork-pi"));
  console.log("  PASS");
}

export async function runSessionSwitchCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: session switch (removed — all sessions use pi) ---");
  console.log("  PASS");
}

export async function runPiSessionSwitchCommandSmoke() {
  console.log("--- smoke: pi session switch command handling ---");
  const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { resumePiSessionById } = await import("../src/cli/session/pi-session-switch-command.mjs");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const { savePiSessionSidecar } = await import("../src/session/sidecar.mjs");

  const sessions = [
    { id: "abc123", path: "abc.jsonl" },
    { id: "def456", path: "def.jsonl" },
  ];
  const disabled = { canSwitchPiSession: () => false };
  assert.deepEqual(await resumePiSessionById("abc", { runner: disabled, sessions, projectMarchDir: "unused" }), [
    "Error: pi session resume requires the pi runtime host",
  ]);

  const tempRoot = mkdtempSync(join(tmpdir(), "march-pi-switch-"));
  const projectMarchDir = join(tempRoot, ".march");
  assert.deepEqual(await resumePiSessionById("abc", {
    runner: { canSwitchPiSession: () => true, engine: { cwd: "D:/repo" } },
    sessions,
    projectMarchDir,
  }), ["Error: pi session sidecar not found for abc123; refusing partial resume"]);

  let switchedPath = null;
  const engine = new ContextEngine({ cwd: "D:/repo", modelId: "test", provider: "deepseek" });
  const sidecarDir = join(projectMarchDir, "pi-sidecars");
  mkdirSync(sidecarDir, { recursive: true });
  const sourceEngine = new ContextEngine({
    cwd: "D:/repo",
    modelId: "test",
    provider: "deepseek",
    thinkingLevel: "high",
    namespace: "ns",
  });
  sourceEngine.recordTurn({ userMessage: "hello", assistantMessage: "answer" });
  savePiSessionSidecar({
    projectMarchDir,
    sessionRef: "abc.jsonl",
    engine: sourceEngine,
    metadata: { sessionId: "abc123", sessionFile: "abc.jsonl" },
  });
  savePiSessionSidecar({
    projectMarchDir,
    sessionRef: "def.jsonl",
    engine: sourceEngine,
    metadata: { sessionId: "def456", sessionFile: "def.jsonl" },
  });
  writeFileSync(join(sidecarDir, "bad.json"), JSON.stringify({ version: 999 }), "utf8");
  const runner = {
    canSwitchPiSession: () => true,
    engine,
    switchPiSession: async (path, restoreState) => {
      switchedPath = path;
      engine.restoreSession(restoreState, null, { replace: true });
      return { cancelled: false };
    },
  };
  assert.deepEqual(await resumePiSessionById("abc", { runner, sessions, projectMarchDir }), ["Resumed pi session: abc123"]);
  assert.equal(switchedPath, "abc.jsonl");
  assert.equal(engine.thinkingLevel, "high");
  assert.equal(engine.turns[0].assistantMessage, "answer");
  assert.deepEqual(await resumePiSessionById("missing", { runner, sessions, projectMarchDir }), ["Error: pi session not found: missing"]);
  assert.deepEqual(await resumePiSessionById("a", { runner, sessions: [{ id: "aa", path: "1" }, { id: "ab", path: "2" }], projectMarchDir }), [
    "Error: pi session id is ambiguous: a (aa, ab)",
  ]);
  assert.deepEqual(await resumePiSessionById("bad", {
    runner,
    sessions: [{ id: "bad999", path: "bad.jsonl" }],
    projectMarchDir,
  }), ["Error: pi session sidecar is invalid for bad999: Invalid pi session sidecar"]);
  assert.deepEqual(await resumePiSessionById("def", {
    runner: { canSwitchPiSession: () => true, engine: { cwd: "D:/repo" }, switchPiSession: async () => ({ cancelled: true }) },
    sessions,
    projectMarchDir,
  }), ["Resume pi session cancelled: def456"]);

  let restoreCalled = false;
  assert.deepEqual(await resumePiSessionById("abc", {
    runner: {
      canSwitchPiSession: () => true,
      engine: {
        cwd: "D:/repo",
        restoreSession: () => { restoreCalled = true; },
      },
      switchPiSession: async () => { throw new Error("runtime exploded"); },
    },
    sessions,
    projectMarchDir,
  }), ["Error: failed to switch pi session abc123: runtime exploded"]);
  assert.equal(restoreCalled, false);

  const mismatchEngine = new ContextEngine({ cwd: "D:/other", modelId: "test", provider: "deepseek" });
  assert.deepEqual(await resumePiSessionById("abc", {
    runner: { canSwitchPiSession: () => true, engine: mismatchEngine },
    sessions,
    projectMarchDir,
  }), ["Error: pi session sidecar cwd mismatch for abc123: D:/repo"]);
  rmSync(tempRoot, { recursive: true, force: true });
  console.log("  PASS");
}
