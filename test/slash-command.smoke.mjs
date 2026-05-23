import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { savePiSessionSidecar } from "../src/session/sidecar.mjs";

export async function runSlashCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: slash command handling ---");
  const { handleSlashCommand } = await import("../src/cli/slash-commands.mjs");
  const { createModeState } = await import("../src/cli/input/mode-state.mjs");
  const output = [];
  let clearOutputCount = 0;
  const ui = { writeln: (text) => output.push(text), clearOutput: () => { clearOutputCount++; output.length = 0; } };
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
      turns: [{ index: 1, userMessage: "slash pi", assistantMessage: "ok" }],
    },
  });
  let restored = null;
  const runner = {
    engine: {
      cwd: dir,
      modelId: "test-model",
      provider: "deepseek",
      thinkingLevel: "medium",
      turns: [{ assistantMessage: "previous answer" }],
      sessionName: "",
      setSessionName(name) { this.sessionName = name; },
      restoreSession(state) { restored = state; },
    },
    getAvailableThinkingLevels: () => ["off", "medium", "high"],
    getThinkingLevel: () => "high",
    setThinkingLevel: (level) => level,
    getCurrentModel: () => ({ id: "m1", name: "Model One", provider: "test" }),
    getScopedModels: () => [{ model: { id: "m1", name: "Model One", provider: "test" } }],
    getConfiguredProviders: () => ["deepseek", "openai"],
    setModel: async (model) => model,
    canSwitchPiSession: () => true,
    startNewSession: async () => ({ sessionId: "new-session" }),
    restartRuntime: async () => ({ engine: { modelId: "test-model" } }),
    switchPiSession: async (_path, restoreState) => {
      runner.engine.restoreSession(restoreState, null, { replace: true });
      return { cancelled: false };
    },
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
    shellRuntime: {
      spawnShell: ({ name }) => ({
        id: "sh2",
        name: name || "powershell.exe",
        status: "running",
        command: "powershell.exe",
        args: ["-NoLogo"],
        lineCount: 0,
      }),
      listShells: () => [{
        id: "sh1",
        name: "dev",
        status: "running",
        command: "powershell.exe",
        args: ["-NoLogo"],
        lineCount: 1,
      }],
      snapshotShell: () => ({ plain: "ready", ansi: "\x1b[32mready\x1b[0m" }),
    },
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
  const newSession = await handleSlashCommand("/new", {
    ui,
    runner,
    sessionState,
    sessionsRoot,
    projectMarchDir,
    renderStartupBanner: () => ["March", "banner"],
  });
  assert.equal(newSession.handled, true);
  assert.equal(newSession.refreshContextTokens, true);
  assert.equal(clearOutputCount, 1);
  assert.deepEqual(output, ["March", "banner"]);

  const status = await handleSlashCommand("/status", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(status.handled, true);
  assert.ok(output.join("\n").includes("session:s1"));
  assert.ok(output.join("\n").includes("model:test-model"));
  assert.ok(output.join("\n").includes("tokens:1in/2out"));
  const help = await handleSlashCommand("/help", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(help.handled, true);
  const helpText = output.join("\n");
  const { getHelpCommandSyntaxes } = await import("../src/cli/commands/catalog/visible-commands.mjs");
  for (const syntax of getHelpCommandSyntaxes()) assert.ok(helpText.includes(syntax), `missing help command: ${syntax}`);
  assert.ok(helpText.includes("/shell spawn [name]"));
  assert.ok(helpText.includes("/export gist <jsonl|html>"));
  assert.ok(helpText.includes("Sessions:"));
  assert.ok(!helpText.includes("/mouse"));
  assert.ok(!helpText.includes("/notify"));
  assert.ok(!helpText.includes("/models"));
  assert.ok(!helpText.includes("/providers <name>"));
  assert.ok(!helpText.includes("/sessions"));
  assert.ok(!helpText.includes("/resume"));
  assert.ok(!helpText.includes("/fork-pi"));
  const reload = await handleSlashCommand("/reload", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(reload.handled, true);
  assert.equal(reload.refreshContextTokens, true);
  assert.ok(output.join("\n").includes("March runtime 已重启"));
  const modeState = createModeState();
  const discuss = await handleSlashCommand("/discuss", { ui, runner, sessionState, sessionsRoot, projectMarchDir, modeState });
  assert.equal(discuss.handled, true);
  assert.equal(modeState.get(), "discuss");
  assert.ok(output.join("\n").includes("Mode: Discuss"));
  const mode = await handleSlashCommand("/mode", { ui, runner, sessionState, sessionsRoot, projectMarchDir, modeState });
  assert.equal(mode.handled, true);
  assert.ok(output.join("\n").includes("Mode: Discuss"));
  const doMode = await handleSlashCommand("/do", { ui, runner, sessionState, sessionsRoot, projectMarchDir, modeState });
  assert.equal(doMode.handled, true);
  assert.equal(modeState.get(), "do");
  assert.ok(output.join("\n").includes("Mode: Do"));
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
  const templates = await handleSlashCommand("/templates", {
    ui,
    runner,
    sessionState,
    sessionsRoot,
    projectMarchDir,
    promptTemplates: [{ name: "review", path: "review.md", body: "" }],
    promptTemplateDiagnostics: [{ type: "warning", message: "bad template" }],
  });
  assert.equal(templates.handled, true);
  assert.ok(output.join("\n").includes("/review"));
  assert.ok(output.join("\n").includes("bad template"));
  const exportJsonl = await handleSlashCommand("/export jsonl", { ui, runner, sessionState, sessionsRoot, projectMarchDir, sessionSource: "pi" });
  assert.equal(exportJsonl.handled, true);
  assert.ok(output.join("\n").includes("Exported JSONL:"));
  assert.ok(output.join("\n").includes("(1 turns)"));
  assert.ok(existsSync(join(projectMarchDir, "exports")));
  const exportHtml = await handleSlashCommand("/export html", { ui, runner, sessionState, sessionsRoot, projectMarchDir, sessionSource: "pi" });
  assert.equal(exportHtml.handled, true);
  assert.ok(output.join("\n").includes("Exported HTML:"));
  const settings = await handleSlashCommand("/settings", { ui, runner, sessionState, sessionsRoot, projectMarchDir, settingsHomeDir: dir });
  assert.equal(settings.handled, true);
  assert.ok(output.join("\n").includes("Settings:"));
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
  ui.selectList = async ({ items }) => items[0];
  const selectedThinking = await handleSlashCommand("/thinking", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(selectedThinking.handled, true);
  assert.ok(output.join("\n").includes("thinking: off"));
  ui.selectList = async ({ items, anchor }) => {
    assert.equal(anchor, undefined);
    return items[0];
  };
  const model = await handleSlashCommand("/model", { ui, runner, sessionState, sessionsRoot, projectMarchDir, configHomeDir: dir });
  assert.equal(model.handled, true);
  assert.ok(output.join("\n").includes("Model: Model One (test)"));
  const modelConfig = JSON.parse(readFileSync(join(dir, ".march", "config.json"), "utf8"));
  assert.equal(modelConfig.provider, "test");
  assert.equal(modelConfig.model, "m1");
  const indexedModel = await handleSlashCommand("/model 1", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(indexedModel.handled, true);
  assert.ok(output.join("\n").includes("Use /model without arguments"));
  const session = await handleSlashCommand("/session", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(session.handled, true);
  assert.ok(output.join("\n").includes("Resumed pi session: pi-slash"));
  assert.equal(restored.turns[0].assistantMessage, "ok");
  const shellList = await handleSlashCommand("/shell", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(shellList.handled, true);
  assert.ok(output.join("\n").includes("Shells:"));
  assert.ok(output.join("\n").includes("sh1  dev  running"));
  const shellSpawn = await handleSlashCommand("/shell spawn qa", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(shellSpawn.handled, true);
  assert.ok(output.join("\n").includes("Spawned shell: sh2  qa  running"));
  const shellShow = await handleSlashCommand("/shell dev", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(shellShow.handled, true);
  assert.ok(output.join("\n").includes("Recent output:"));
  assert.ok(output.join("\n").includes("ready"));
  const name = await handleSlashCommand("/name Sprint", { ui, runner, sessionState, sessionsRoot, projectMarchDir, sessionSource: "pi" });
  assert.equal(name.handled, true);
  assert.equal(runner.engine.sessionName, "Sprint");
  assert.ok(output.join("\n").includes("Session named: Sprint"));
  const copied = [];
  const copy = await handleSlashCommand("/copy", {
    ui,
    runner,
    sessionState,
    sessionsRoot,
    projectMarchDir,
    writeClipboard: (text) => {
      copied.push(text);
      return { ok: true };
    },
  });
  assert.equal(copy.handled, true);
  assert.deepEqual(copied, ["previous answer"]);
  assert.ok(output.join("\n").includes("Copied last assistant response"));
  assert.equal(existsSync(join(sessionState.sessionDir, "session.json")), false);
  assert.equal((await handleSlashCommand("/compact", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, false);
  assert.equal((await handleSlashCommand("/mouse", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, true);
  assert.equal(output.at(-1), "Mouse selection is always enabled.");
  assert.equal((await handleSlashCommand("/sessions", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, false);
  assert.equal((await handleSlashCommand("/resume pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, false);
  assert.equal((await handleSlashCommand("/fork-pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, false);
  assert.equal((await handleSlashCommand("/clone-pi", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, false);
  assert.equal((await handleSlashCommand("/models", { ui, runner, sessionState, sessionsRoot, projectMarchDir })).handled, false);
  const unknown = await handleSlashCommand("/unknown", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(unknown.handled, false);
  cleanup(dir);
  console.log("  PASS");
}
