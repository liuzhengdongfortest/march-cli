import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
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
  const { createPiSessionManager, getPiSessionDir, resolvePiSessionManager } = await import("../src/session/pi-manager.mjs");
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
