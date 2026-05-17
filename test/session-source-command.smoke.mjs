import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runSessionSourceCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: session source slash command handling ---");
  const { handleSessionSourceCommand } = await import("../src/cli/session/session-source-command.mjs");
  const { savePiSessionSidecar } = await import("../src/session/sidecar.mjs");

  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  const piSessionDir = join(projectMarchDir, "pi-sessions");
  mkdirSync(piSessionDir, { recursive: true });
  writeFileSync(join(piSessionDir, "2026-05-10T00-00-00-000Z_pi.jsonl"), [
    JSON.stringify({ type: "session", version: 3, id: "pi-slash", timestamp: "2026-05-10T00:00:00.000Z", cwd: dir }),
    JSON.stringify({ type: "message", id: "u1", parentId: null, timestamp: "2026-05-10T00:00:01.000Z", message: { role: "user", content: "slash pi", timestamp: 1778342401000 } }),
    JSON.stringify({ type: "message", id: "a1", parentId: "u1", timestamp: "2026-05-10T00:00:02.000Z", message: { role: "assistant", content: [{ type: "text", text: "ok" }], provider: "test", model: "test", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 1778342402000 } }),
    "",
  ].join("\n"));
  savePiSessionSidecar({
    projectMarchDir,
    sessionRef: "2026-05-10T00-00-00-000Z_pi.jsonl",
    engine: {
      cwd: dir,
      modelId: "test-model",
      provider: "deepseek",
      namespace: "ns",
      turns: [{ index: 1, userMessage: "slash pi", assistantMessage: "ok" }],
    },
  });

  const output = [];
  const ui = {
    writeln: (text) => output.push(text),
    selectList: async ({ items, selectedIndex, searchable, getSearchText }) => {
      assert.equal(selectedIndex, 0);
      assert.equal(searchable, true);
      assert.ok(getSearchText(items[0]).includes("slash pi"));
      return items[0];
    },
  };
  let restored = null;
  let switchedPath = null;
  const runner = {
    engine: {
      cwd: dir,
      modelId: "test-model",
      provider: "deepseek",
      namespace: "ns",
      turns: [],
      restoreSession: (state) => {
        restored = state;
      },
    },
    canSwitchPiSession: () => true,
    switchPiSession: async (path) => {
      switchedPath = path;
      return { cancelled: false };
    },
    getSessionStats: () => ({ sessionId: "pi-slash" }),
  };
  const sessionsRoot = join(dir, "sessions");
  const sessionState = { sessionId: "s1", sessionDir: join(sessionsRoot, "s1") };

  const session = await handleSessionSourceCommand("/session", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(session.handled, true);
  assert.ok(output.join("\n").includes("Resumed pi session: pi-slash"));
  assert.equal(restored.turns[0].assistantMessage, "ok");
  assert.ok(switchedPath.endsWith("2026-05-10T00-00-00-000Z_pi.jsonl"));
  assert.equal((await handleSessionSourceCommand("/sessions", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, false);
  assert.equal((await handleSessionSourceCommand("/sessions tree", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, false);
  assert.equal((await handleSessionSourceCommand("/resume pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, false);
  assert.equal((await handleSessionSourceCommand("/resume-pi pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, false);
  assert.equal((await handleSessionSourceCommand("/clone-pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, false);
  assert.equal((await handleSessionSourceCommand("/fork-pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, false);
  assert.equal((await handleSessionSourceCommand("/session entries", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, false);
  const defaultPiSave = await handleSessionSourceCommand("/save", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(defaultPiSave.handled, true);
  assert.ok(output.join("\n").includes("Pi session auto-saved: pi-slash"));
  assert.equal((await handleSessionSourceCommand("/unknown", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, false);

  cleanup(dir);
  console.log("  PASS");
}
