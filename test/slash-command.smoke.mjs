import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runSlashCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: slash command handling ---");
  const { handleSlashCommand } = await import("../src/cli/slash-commands.mjs");
  const { savePiSessionSidecar } = await import("../src/session/sidecar.mjs");
  const output = [];
  const ui = { writeln: (text) => output.push(text), toggleMouse: () => false };
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
  let restored = null;
  const runner = {
    engine: {
      cwd: dir,
      modelId: "test-model",
      provider: "deepseek",
      thinkingLevel: "medium",
      turns: [1, 2],
      openFiles: new Map(),
      skills: [],
      pins: new Set(),
      getPins: () => [],
      restoreSession: (state) => {
        restored = state;
      },
    },
    cycleThinkingLevel: () => "high",
    getAvailableThinkingLevels: () => ["off", "medium", "high"],
    getThinkingLevel: () => "high",
    setThinkingLevel: (level) => level,
    cycleModel: async () => ({ model: { id: "m2", provider: "test" }, thinkingLevel: "medium" }),
    getCurrentModel: () => ({ id: "m1", name: "Model One", provider: "test" }),
    getScopedModels: () => [{ model: { id: "m1", name: "Model One", provider: "test" } }],
    setModel: async (model) => model,
    canSwitchPiSession: () => true,
    getExtensionDiagnostics: () => [{ type: "warning", message: "extension skipped" }],
    getExtensionLifecycleState: () => ({
      status: "read-only",
      registeredHookCount: 0,
      policy: {
        mode: "read-only",
        defaultBlocking: false,
        deniedEffects: ["write-files", "run-shell"],
      },
      diagnostics: [
        { type: "warning", message: "manifest skipped" },
        { type: "warning", message: "extension skipped" },
      ],
    }),
    switchPiSession: async () => ({ cancelled: false }),
    clonePiSession: async () => ({ cancelled: false, sessionId: "pi-clone", sourceSessionId: "s1" }),
    getPiForkCandidates: () => [{ entryId: "u1", text: "fork me" }],
    forkPiSessionWithResetContext: async () => ({ cancelled: false, sessionId: "pi-fork", sourceSessionId: "s1", entryId: "u1" }),
    compact: async () => ({ summary: "compact summary" }),
    getSessionStats: () => ({
      sessionId: "s1",
      userMessages: 1,
      assistantMessages: 1,
      toolCalls: 0,
      totalMessages: 2,
      tokens: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
      cost: 0.01,
    }),
  };
  const sessionsRoot = join(dir, "sessions");
  const sessionState = { sessionId: "s1", sessionDir: join(sessionsRoot, "s1") };
  const status = await handleSlashCommand("/status", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(status.handled, true);
  assert.ok(output.join("\n").includes("session: s1"));
  const help = await handleSlashCommand("/help", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(help.handled, true);
  assert.ok(output.join("\n").includes("/extensions"));
  assert.ok(output.join("\n").includes("/sessions and /resume <id> use default pi JSONL sessions"));
  assert.ok(output.join("\n").includes("/sessions pi and /resume-pi <id> are explicit pi aliases"));
  assert.ok(output.join("\n").includes("legacy .march/sessions use /sessions legacy"));
  assert.ok(output.join("\n").includes("/session entries and /fork-pi list in-file entry candidates"));
  const hotkeys = await handleSlashCommand("/hotkeys", {
    ui,
    runner,
    sessionState,
    sessionsRoot,
    projectMarchDir,
    keybindings: { modelSelector: "Ctrl+M" },
    keybindingDiagnostics: [{ type: "warning", message: "bad key" }],
  });
  assert.equal(hotkeys.handled, true);
  assert.ok(output.join("\n").includes("Ctrl+M"));
  assert.ok(output.join("\n").includes("bad key"));
  const thinking = await handleSlashCommand("/thinking list", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(thinking.handled, true);
  assert.ok(output.join("\n").includes("* 3. high"));
  const extensions = await handleSlashCommand("/extensions", {
    ui,
    runner,
    sessionState,
    sessionsRoot,
    projectMarchDir,
    extensionPaths: [join(dir, ".march", "extensions", "a.js")],
  });
  assert.equal(extensions.handled, true);
  assert.ok(output.join("\n").includes("Configured extension paths:"));
  assert.ok(output.join("\n").includes("this list does not guarantee successful extension startup"));
  assert.ok(output.join("\n").includes("Extension diagnostics:"));
  assert.ok(output.join("\n").includes("March lifecycle hooks:"));
  assert.ok(output.join("\n").includes("policy: read-only; blocking by default: no"));
  assert.ok(output.join("\n").includes("March lifecycle diagnostics:"));
  assert.ok(output.join("\n").includes("warning: manifest skipped"));
  assert.ok(output.join("\n").includes("warning: extension skipped"));
  const indexedThinking = await handleSlashCommand("/thinking 2", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(indexedThinking.handled, true);
  assert.ok(output.join("\n").includes("thinking: medium"));
  const model = await handleSlashCommand("/model", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(model.handled, true);
  assert.ok(output.join("\n").includes("Model: m2 (test)"));
  const indexedModel = await handleSlashCommand("/model 1", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(indexedModel.handled, true);
  assert.ok(output.join("\n").includes("Model: Model One (test)"));
  const session = await handleSlashCommand("/session", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(session.handled, true);
  assert.ok(output.join("\n").includes("messages: 1u + 1a + 0t = 2 total"));
  const piSessions = await handleSlashCommand("/sessions pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(piSessions.handled, true);
  assert.ok(output.join("\n").includes("pi-slash"));
  const piSessionTree = await handleSlashCommand("/sessions pi tree", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(piSessionTree.handled, true);
  assert.ok(output.join("\n").includes("file-level tree uses pi JSONL parentSessionPath"));
  const defaultPiSessions = await handleSlashCommand("/sessions", { ui, runner, sessionState, sessionsRoot, projectMarchDir, sessionSource: "pi" });
  assert.equal(defaultPiSessions.handled, true);
  assert.ok(output.join("\n").includes("pi JSONL session files"));
  const defaultPiSessionTree = await handleSlashCommand("/sessions tree", { ui, runner, sessionState, sessionsRoot, projectMarchDir, sessionSource: "pi" });
  assert.equal(defaultPiSessionTree.handled, true);
  assert.ok(output.join("\n").includes("file-level tree uses pi JSONL parentSessionPath"));
  const legacySessions = await handleSlashCommand("/sessions legacy", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(legacySessions.handled, true);
  const legacySessionTree = await handleSlashCommand("/sessions legacy tree", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(legacySessionTree.handled, true);
  const resumePi = await handleSlashCommand("/resume-pi pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(resumePi.handled, true);
  assert.ok(output.join("\n").includes("Resumed pi session: pi-slash"));
  assert.equal(restored.turns[0].summary, "summary");
  const defaultResumePi = await handleSlashCommand("/resume pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir, sessionSource: "pi" });
  assert.equal(defaultResumePi.handled, true);
  assert.ok(output.join("\n").includes("Resumed session: pi-slash"));
  const resumeLegacy = await handleSlashCommand("/resume-legacy missing", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(resumeLegacy.handled, true);
  assert.ok(output.join("\n").includes("Error: session not found: missing"));
  const clonePi = await handleSlashCommand("/clone-pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(clonePi.handled, true);
  assert.ok(output.join("\n").includes("Cloned pi session: pi-clone (from: s1)"));
  const forkPi = await handleSlashCommand("/fork-pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(forkPi.handled, true);
  assert.ok(output.join("\n").includes("1. u1  fork me"));
  assert.ok(output.join("\n").includes("These are in-file user entries, not /sessions tree files."));
  const sessionEntries = await handleSlashCommand("/session entries", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(sessionEntries.handled, true);
  assert.ok(output.join("\n").includes("Pi session entry fork candidates (current JSONL file):"));
  const forkPiReset = await handleSlashCommand("/fork-pi u1 --reset-context", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(forkPiReset.handled, true);
  assert.ok(output.join("\n").includes("Forked pi session: pi-fork (from: s1, entry: u1)"));
  const defaultPiFork = await handleSlashCommand("/fork", { ui, runner, sessionState, sessionsRoot, projectMarchDir, sessionSource: "pi" });
  assert.equal(defaultPiFork.handled, true);
  assert.ok(output.join("\n").includes("Pi sessions use explicit branch commands"));
  const defaultPiSave = await handleSlashCommand("/save", { ui, runner, sessionState, sessionsRoot, projectMarchDir, sessionSource: "pi" });
  assert.equal(defaultPiSave.handled, true);
  assert.ok(output.join("\n").includes("Pi session auto-saved: s1"));
  assert.equal(existsSync(join(sessionState.sessionDir, "session.json")), false);
  const forkLegacy = await handleSlashCommand("/fork-legacy", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(forkLegacy.handled, true);
  assert.ok(output.join("\n").includes("Forked legacy session:"));
  const compact = await handleSlashCommand("/compact", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(compact.handled, true);
  assert.ok(output.join("\n").includes("Compacted: 15 char summary"));
  const unknown = await handleSlashCommand("/unknown", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(unknown.handled, false);
  cleanup(dir);
  console.log("  PASS");
}
