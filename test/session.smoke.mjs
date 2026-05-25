import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runSessionPersistenceSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: legacy session persistence removed; March state owns context ---");
  console.log("  PASS");
}
export async function runPiSessionManagerFactorySmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: pi SessionManager factory ---");
  const { createPiSessionManager, getPiSessionDir, listPiSessionInfos, resolvePiSessionManager } = await import("../src/session/pi-manager.mjs");
  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  assert.equal(resolvePiSessionManager({ cwd: dir, projectMarchDir, enabled: false }), null);
  assert.equal(existsSync(getPiSessionDir(projectMarchDir)), false);
  const manager = createPiSessionManager({ cwd: dir, projectMarchDir });
  assert.equal(getPiSessionDir(projectMarchDir), join(projectMarchDir, "pi-sessions"));
  assert.equal(manager.getCwd(), dir);
  assert.equal(manager.getSessionDir(), join(projectMarchDir, "pi-sessions"));
  assert.equal(manager.isPersisted(), true);
  assert.ok(manager.getSessionFile().endsWith(".jsonl"));
  const resolved = resolvePiSessionManager({ cwd: dir, projectMarchDir, enabled: true });
  assert.equal(resolved.getCwd(), dir);
  assert.equal(resolved.getSessionDir(), join(projectMarchDir, "pi-sessions"));
  assert.equal(resolved.isPersisted(), true);

  const sessionFile = join(getPiSessionDir(projectMarchDir), "2026-05-10T00-00-00-000Z_test.jsonl");
  mkdirSync(getPiSessionDir(projectMarchDir), { recursive: true });
  writeFileSync(sessionFile, [
    JSON.stringify({ type: "session", version: 3, id: "pi-session", timestamp: "2026-05-10T00:00:00.000Z", cwd: dir }),
    JSON.stringify({ type: "message", id: "u1", parentId: null, timestamp: "2026-05-10T00:00:01.000Z", message: { role: "user", content: "hello pi", timestamp: 1778342401000 } }),
    JSON.stringify({ type: "message", id: "a1", parentId: "u1", timestamp: "2026-05-10T00:00:02.000Z", message: { role: "assistant", content: [{ type: "text", text: "hi" }], provider: "test", model: "test", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 1778342402000 } }),
    "",
  ].join("\n"));
  const listed = await listPiSessionInfos({ cwd: dir, projectMarchDir });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, "pi-session");
  assert.equal(listed[0].path, sessionFile);
  assert.equal(listed[0].turnCount, 2);
  assert.equal(listed[0].firstMessage, "hello pi");
  cleanup(dir);
  console.log("  PASS");
}

export async function runPiSessionSidecarSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: March session state with pi backend compatibility ---");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const {
    getPiSidecarPath,
    loadPiSessionContextState,
    loadPiSessionSidecar,
    savePiSessionSidecar,
  } = await import("../src/session/sidecar.mjs");

  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  mkdirSync(projectMarchDir, { recursive: true });
  const engine = new ContextEngine({
    cwd: dir,
    modelId: "model",
    provider: "deepseek",
    thinkingLevel: "high",
    namespace: "project-ns",
  });
  engine.recordTurn({ userMessage: "hello", assistantMessage: "answer" });
  engine.setSessionName("March Session State");

  const saved = savePiSessionSidecar({
    projectMarchDir,
    sessionRef: "2026-05-10T00-00-00-000Z_test.jsonl",
    engine,
    metadata: { sessionId: "pi1", sessionFile: "2026-05-10T00-00-00-000Z_test.jsonl" },
  });
  assert.ok(saved.path.endsWith(join("sessions", "pi1", "state.json")));
  assert.equal(saved.state.sessionId, "pi1");
  assert.equal(saved.state.namespace, "project-ns");
  assert.equal(saved.state.thinkingLevel, "high");
  assert.equal(saved.state.sessionName, "March Session State");
  assert.equal(Object.hasOwn(saved.state, "skills"), false);

  const loaded = loadPiSessionSidecar({ projectMarchDir, sessionRef: "2026-05-10T00-00-00-000Z_test" });
  assert.equal(loaded.path, saved.path);
  assert.equal(loaded.state.turns[0].assistantMessage, "answer");
  assert.equal(loadPiSessionSidecar({ projectMarchDir, sessionRef: "missing" }), null);

  const staleSessionPath = join(projectMarchDir, "pi-sessions", "stale.jsonl");
  mkdirSync(join(projectMarchDir, "pi-sessions"), { recursive: true });
  writeFileSync(staleSessionPath, [
    JSON.stringify({ type: "message", message: { role: "user", content: "from transcript" } }),
    JSON.stringify({ type: "message", message: { role: "assistant", content: "restored answer" } }),
  ].join("\n"), "utf8");
  savePiSessionSidecar({ projectMarchDir, sessionRef: staleSessionPath, engine: new ContextEngine({ cwd: dir, modelId: "model" }) });
  const contextState = loadPiSessionContextState({ projectMarchDir, sessionRef: staleSessionPath });
  assert.deepEqual(contextState.state.turns, [{ index: 1, userMessage: "from transcript", assistantMessage: "restored answer" }]);

  const invalidPath = getPiSidecarPath(projectMarchDir, "invalid");
  mkdirSync(join(invalidPath, ".."), { recursive: true });
  writeFileSync(invalidPath, JSON.stringify({ version: 999 }), "utf8");
  assert.throws(() => loadPiSessionSidecar({ projectMarchDir, sessionRef: "invalid" }), /Invalid March session state/);

  cleanup(dir);
  console.log("  PASS");
}

export async function runPiSessionSidecarSyncSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: March session state sync ---");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const { loadPiSessionSidecar } = await import("../src/session/sidecar.mjs");
  const { syncPiSessionSidecar } = await import("../src/session/sidecar-sync.mjs");
  const { loadMarchSessionState } = await import("../src/session/state/march-session-state.mjs");
  const { loadMarchSessionRenderTimeline, saveMarchSessionRenderTimeline } = await import("../src/session/state/march-session-ui-state.mjs");

  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  const engine = new ContextEngine({
    cwd: dir,
    modelId: "model",
    provider: "deepseek",
    thinkingLevel: "high",
    namespace: "project-ns",
  });
  engine.recordTurn({ userMessage: "hello", assistantMessage: "answer" });

  assert.equal(syncPiSessionSidecar({
    enabled: false,
    projectMarchDir,
    engine,
    sessionStats: { persisted: true, sessionFile: "pi.jsonl" },
  }), null);
  assert.equal(syncPiSessionSidecar({
    enabled: true,
    projectMarchDir,
    engine,
    sessionStats: { persisted: false, sessionFile: "pi.jsonl" },
  }), null);

  const synced = syncPiSessionSidecar({
    enabled: true,
    projectMarchDir,
    engine,
    sessionStats: {
      sessionId: "pi1",
      persisted: true,
      sessionFile: "2026-05-10T00-00-00-000Z_test.jsonl",
      runtimeHost: true,
    },
  });
  assert.ok(synced.path.endsWith(join("sessions", "pi1", "state.json")));
  const loaded = loadPiSessionSidecar({ projectMarchDir, sessionRef: "2026-05-10T00-00-00-000Z_test.jsonl" });
  assert.equal(loaded.state.sessionId, "pi1");
  assert.equal(loaded.state.backend.runtimeHost, true);
  assert.equal(loaded.state.thinkingLevel, "high");
  assert.equal(loaded.state.turns[0].assistantMessage, "answer");
  assert.deepEqual(loaded.state.renderTimeline, []);
  assert.deepEqual(loadMarchSessionRenderTimeline({ projectMarchDir, sessionId: "pi1" }).renderTimeline.map((event) => event.method), ["writeln", "turnStart", "textDelta", "assistantReplyEnd", "turnEnd"]);

  saveMarchSessionRenderTimeline({
    projectMarchDir,
    sessionId: "pi1",
    renderTimeline: [{ method: "writeln", args: ["visible chat"], at: 1 }],
  });
  syncPiSessionSidecar({
    enabled: true,
    projectMarchDir,
    engine,
    sessionStats: { sessionId: "pi1", persisted: true, sessionFile: "2026-05-10T00-00-00-000Z_test.jsonl" },
  });
  assert.equal(loadMarchSessionState({ projectMarchDir, sessionId: "pi1" }).state.renderTimeline[0].args[0], "visible chat");

  cleanup(dir);
  console.log("  PASS");
}

export async function runPiSessionTranscriptSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: pi session transcript restore ---");
  const { loadPiSessionTranscriptTurns, writeTranscriptToOutput } = await import("../src/session/transcript.mjs");
  const { OutputBuffer } = await import("../src/cli/tui/output-buffer.mjs");

  const dir = setupTmp();
  mkdirSync(dir, { recursive: true });
  const sessionFile = join(dir, "session.jsonl");
  const lines = [JSON.stringify({ type: "session", version: 3, id: "s1", timestamp: "2026-05-10T00:00:00.000Z", cwd: dir })];
  for (let i = 1; i <= 22; i += 1) {
    lines.push(JSON.stringify({ type: "message", id: `u${i}`, parentId: null, message: { role: "user", content: `user ${i}` } }));
    lines.push(JSON.stringify({ type: "message", id: `a${i}`, parentId: `u${i}`, message: { role: "assistant", content: [{ type: "text", text: `assistant ${i}` }] } }));
  }
  lines.push("{bad json", "");
  writeFileSync(sessionFile, lines.join("\n"));

  const turns = loadPiSessionTranscriptTurns(sessionFile);
  assert.equal(turns.length, 20);
  assert.equal(turns[0].userMessage, "user 3");
  assert.equal(turns.at(-1).assistantMessage, "assistant 22");

  const plainOutput = new OutputBuffer();
  writeTranscriptToOutput(plainOutput, turns.slice(-1));
  const rendered = stripAnsi(plainOutput.render(80).join("\n"));
  assert.ok(rendered.includes("You\nuser 22"));
  assert.ok(rendered.includes("March\nassistant 22"));

  const markdownOutput = new OutputBuffer();
  writeTranscriptToOutput(markdownOutput, [{
    userMessage: "show markdown",
    assistantMessage: "### Title\n**bold**\n\n```js\nconst a = 1;\n```",
  }]);
  const markdownRendered = stripAnsi(markdownOutput.render(80).join("\n"));
  assert.ok(markdownRendered.includes("Title"));
  assert.ok(markdownRendered.includes("bold"));
  assert.ok(markdownRendered.includes("const a = 1"));
  assert.ok(!markdownRendered.includes("###"));
  assert.ok(!markdownRendered.includes("**bold**"));

  cleanup(dir);
  console.log("  PASS");
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

export async function runSessionTreeSmoke() {
  console.log("--- smoke: session tree formatting ---");
  const { buildSessionTree, formatSessionTree } = await import("../src/session/tree.mjs");
  const sessions = [
    { id: "root", savedAt: "2026-05-09T10:00:00.000Z", turnCount: 2, parentSessionId: null },
    { id: "child", savedAt: "2026-05-09T11:00:00.000Z", turnCount: 3, parentSessionId: "root" },
    { id: "grandchild", savedAt: "2026-05-09T12:00:00.000Z", turnCount: 4, parentSessionId: "child" },
  ];
  const tree = buildSessionTree(sessions);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].children[0].children[0].id, "grandchild");
  const lines = formatSessionTree(sessions, "child");
  assert.ok(lines.some((line) => line.startsWith("  * child")));
  assert.ok(lines.some((line) => line.startsWith("    - grandchild")));
  console.log("  PASS");
}
