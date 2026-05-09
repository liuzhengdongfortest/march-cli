import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runSessionPersistenceSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: session persistence ---");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const { saveSession, loadSession, forkSession, listSessions } = await import("../src/session/persist.mjs");
  const dir = setupTmp();
  const sessionsRoot = join(dir, "sessions");
  const sessionDir = join(sessionsRoot, "test-session");

  const engine = new ContextEngine({
    cwd: dir,
    modelId: "test",
    provider: "deepseek",
    skills: [],
    pins: [],
  });

  engine.recordTurn({ userMessage: "turn 1", summary: "did thing 1" });
  engine.recordTurn({ userMessage: "turn 2", summary: "did thing 2" });
  engine.addPin("/fake/path.txt");

  const saved = saveSession(sessionDir, engine);
  assert.equal(saved.turns.length, 2);
  assert.equal(saved.pins.length, 1);

  const loaded = loadSession(sessionDir);
  assert.equal(loaded.turns.length, 2);
  assert.equal(loaded.pins[0], "/fake/path.txt");
  assert.equal(loaded.modelId, "test");

  const engine2 = new ContextEngine({ cwd: dir, modelId: "test", provider: "deepseek", skills: [], pins: [] });
  engine2.restoreSession(loaded);
  assert.equal(engine2.turns.length, 2);
  assert.equal(engine2.getPins().length, 1);

  const replacement = new ContextEngine({
    cwd: dir,
    modelId: "test",
    provider: "deepseek",
    skills: [],
    pins: ["/old/pin.txt"],
  });
  replacement.recordTurn({ userMessage: "old", summary: "old" });
  replacement.restoreSession(loaded, [], { replace: true });
  assert.equal(replacement.turns.length, 2);
  assert.deepEqual(replacement.getPins(), ["/fake/path.txt"]);

  const forked = forkSession(sessionsRoot, "test-session", engine, { targetSessionId: "forked-session" });
  assert.equal(forked.id, "forked-session");
  assert.equal(forked.state.parentSessionId, "test-session");
  const forkedLoaded = loadSession(forked.sessionDir);
  assert.equal(forkedLoaded.parentSessionId, "test-session");
  assert.equal(forkedLoaded.turns.length, 2);
  assert.ok(listSessions(sessionsRoot).some((s) => s.id === "forked-session" && s.parentSessionId === "test-session"));

  cleanup(dir);
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
  console.log("--- smoke: pi session sidecar ---");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const {
    getPiSidecarPath,
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
    skills: ["review"],
    pins: ["/pinned.txt"],
    namespace: "project-ns",
  });
  engine.recordTurn({ userMessage: "hello", summary: "summary" });

  const saved = savePiSessionSidecar({
    projectMarchDir,
    sessionRef: "2026-05-10T00-00-00-000Z_test.jsonl",
    engine,
    metadata: { sessionId: "pi1", sessionFile: "session.jsonl" },
  });
  assert.ok(saved.path.endsWith(join("pi-sidecars", "2026-05-10T00-00-00-000Z_test.json")));
  assert.equal(saved.state.sessionId, "pi1");
  assert.equal(saved.state.namespace, "project-ns");
  assert.deepEqual(saved.state.pins, ["/pinned.txt"]);
  assert.deepEqual(saved.state.skills, ["review"]);

  const loaded = loadPiSessionSidecar({ projectMarchDir, sessionRef: "2026-05-10T00-00-00-000Z_test" });
  assert.equal(loaded.path, saved.path);
  assert.equal(loaded.state.turns[0].summary, "summary");
  assert.equal(loadPiSessionSidecar({ projectMarchDir, sessionRef: "missing" }), null);

  const invalidPath = getPiSidecarPath(projectMarchDir, "invalid");
  writeFileSync(invalidPath, JSON.stringify({ version: 999 }), "utf8");
  assert.throws(() => loadPiSessionSidecar({ projectMarchDir, sessionRef: "invalid" }), /Invalid pi session sidecar/);

  cleanup(dir);
  console.log("  PASS");
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
