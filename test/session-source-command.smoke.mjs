import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
      turns: [{ index: 1, userMessage: "slash pi", summary: "summary" }],
      _compactionSummary: null,
      pins: new Set(),
      skills: [],
      openFiles: new Map(),
    },
    metadata: { sessionId: "pi-slash", sessionFile: "2026-05-10T00-00-00-000Z_pi.jsonl" },
  });

  const output = [];
  const ui = { writeln: (text) => output.push(text) };
  let restored = null;
  const runner = {
    engine: {
      cwd: dir,
      modelId: "test-model",
      provider: "deepseek",
      namespace: "ns",
      turns: [],
      _compactionSummary: null,
      pins: new Set(),
      openFiles: new Map(),
      skills: [],
      restoreSession: (state) => {
        restored = state;
      },
    },
    canSwitchPiSession: () => true,
    switchPiSession: async () => ({ cancelled: false }),
    clonePiSession: async () => ({ cancelled: false, sessionId: "pi-clone", sourceSessionId: "s1" }),
    getPiForkCandidates: () => [{ entryId: "u1", text: "fork me" }],
    forkPiSessionWithResetContext: async () => ({ cancelled: false, sessionId: "pi-fork", sourceSessionId: "s1", entryId: "u1" }),
    getSessionStats: () => ({ sessionId: "s1" }),
  };
  const sessionsRoot = join(dir, "sessions");
  const sessionState = { sessionId: "s1", sessionDir: join(sessionsRoot, "s1") };

  const piSessions = await handleSessionSourceCommand("/sessions pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(piSessions.handled, true);
  assert.ok(output.join("\n").includes("pi-slash"));
  const piSessionTree = await handleSessionSourceCommand("/sessions pi tree", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(piSessionTree.handled, true);
  assert.ok(output.join("\n").includes("file-level tree uses pi JSONL parentSessionPath"));
  const defaultPiSessions = await handleSessionSourceCommand("/sessions", { ui, runner, sessionState, sessionsRoot, projectMarchDir, sessionSource: "pi" });
  assert.equal(defaultPiSessions.handled, true);
  assert.ok(output.join("\n").includes("pi JSONL session files"));
  const defaultPiSessionTree = await handleSessionSourceCommand("/sessions tree", { ui, runner, sessionState, sessionsRoot, projectMarchDir, sessionSource: "pi" });
  assert.equal(defaultPiSessionTree.handled, true);
  assert.ok(output.join("\n").includes("file-level tree uses pi JSONL parentSessionPath"));
  assert.equal((await handleSessionSourceCommand("/sessions legacy", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, true);
  assert.equal((await handleSessionSourceCommand("/sessions legacy tree", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, true);

  const resumePi = await handleSessionSourceCommand("/resume-pi pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(resumePi.handled, true);
  assert.ok(output.join("\n").includes("Resumed pi session: pi-slash"));
  assert.equal(restored.turns[0].summary, "summary");
  const defaultResumePi = await handleSessionSourceCommand("/resume pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir, sessionSource: "pi" });
  assert.equal(defaultResumePi.handled, true);
  assert.ok(output.join("\n").includes("Resumed session: pi-slash"));
  const resumeLegacy = await handleSessionSourceCommand("/resume-legacy missing", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(resumeLegacy.handled, true);
  assert.ok(output.join("\n").includes("Error: session not found: missing"));

  const clonePi = await handleSessionSourceCommand("/clone-pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(clonePi.handled, true);
  assert.ok(output.join("\n").includes("Cloned pi session: pi-clone (from: s1)"));
  const forkPi = await handleSessionSourceCommand("/fork-pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(forkPi.handled, true);
  assert.ok(output.join("\n").includes("1. u1  fork me"));
  assert.ok(output.join("\n").includes("These are in-file user entries, not /sessions tree files."));
  const sessionEntries = await handleSessionSourceCommand("/session entries", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(sessionEntries.handled, true);
  assert.ok(output.join("\n").includes("Pi session entry fork candidates (current JSONL file):"));
  const forkPiReset = await handleSessionSourceCommand("/fork-pi u1 --reset-context", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(forkPiReset.handled, true);
  assert.ok(output.join("\n").includes("Forked pi session: pi-fork (from: s1, entry: u1)"));
  const defaultPiFork = await handleSessionSourceCommand("/fork", { ui, runner, sessionState, sessionsRoot, projectMarchDir, sessionSource: "pi" });
  assert.equal(defaultPiFork.handled, true);
  assert.ok(output.join("\n").includes("Pi sessions use explicit branch commands"));
  const defaultPiSave = await handleSessionSourceCommand("/save", { ui, runner, sessionState, sessionsRoot, projectMarchDir, sessionSource: "pi" });
  assert.equal(defaultPiSave.handled, true);
  assert.ok(output.join("\n").includes("Pi session auto-saved: s1"));
  assert.equal(existsSync(join(sessionState.sessionDir, "session.json")), false);
  const forkLegacy = await handleSessionSourceCommand("/fork-legacy", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(forkLegacy.handled, true);
  assert.ok(output.join("\n").includes("Forked legacy session:"));
  assert.equal((await handleSessionSourceCommand("/unknown", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, false);

  cleanup(dir);
  console.log("  PASS");
}
