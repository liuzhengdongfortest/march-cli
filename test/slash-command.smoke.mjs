import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";

export async function runSlashCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: slash command handling ---");
  const { handleSlashCommand } = await import("../src/cli/slash-commands.mjs");
  const output = [];
  const ui = { writeln: (text) => output.push(text), toggleMouse: () => false };
  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  const runner = {
    engine: {
      cwd: dir,
      modelId: "test-model",
      provider: "deepseek",
      thinkingLevel: "medium",
      turns: [{ assistantMessage: "previous answer" }],
      sessionName: "",
      openFiles: new Map(),
      skills: [],
      pins: new Set(),
      getPins: () => [],
      setSessionName(name) { this.sessionName = name; },
    },
    cycleThinkingLevel: () => "high",
    getAvailableThinkingLevels: () => ["off", "medium", "high"],
    getThinkingLevel: () => "high",
    setThinkingLevel: (level) => level,
    cycleModel: async () => ({ model: { id: "m2", provider: "test" }, thinkingLevel: "medium" }),
    getCurrentModel: () => ({ id: "m1", name: "Model One", provider: "test" }),
    getScopedModels: () => [{ model: { id: "m1", name: "Model One", provider: "test" } }],
    getConfiguredProviders: () => ["deepseek", "openai"],
    setModel: async (model) => model,
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
  assert.ok(output.join("\n").includes("session:s1"));
  assert.ok(output.join("\n").includes("model:test-model"));
  assert.ok(output.join("\n").includes("tokens:1in/2out"));
  const help = await handleSlashCommand("/help", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(help.handled, true);
  assert.ok(output.join("\n").includes("/extensions"));
  assert.ok(output.join("\n").includes("/templates"));
  assert.ok(output.join("\n").includes("/export jsonl"));
  assert.ok(output.join("\n").includes("/export html"));
  assert.ok(output.join("\n").includes("/export gist <jsonl|html>"));
  assert.ok(output.join("\n").includes("/settings"));
  assert.ok(output.join("\n").includes("/shell"));
  assert.ok(output.join("\n").includes("/shell spawn [name]"));
  assert.ok(output.join("\n").includes("/copy"));
  assert.ok(output.join("\n").includes("/name"));
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
  const model = await handleSlashCommand("/model", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(model.handled, true);
  assert.ok(output.join("\n").includes("Use Ctrl+L to choose a model."));
  const indexedModel = await handleSlashCommand("/model 1", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(indexedModel.handled, true);
  assert.ok(output.join("\n").includes("Use /model without arguments"));
  const session = await handleSlashCommand("/session", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(session.handled, true);
  assert.ok(output.join("\n").includes("messages: 1u + 1a + 0t = 2 total"));
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
  const compact = await handleSlashCommand("/compact", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(compact.handled, true);
  assert.ok(output.join("\n").includes("Compacted: 15 char summary"));
  const unknown = await handleSlashCommand("/unknown", { ui, runner, sessionState, sessionsRoot, projectMarchDir });
  assert.equal(unknown.handled, false);
  cleanup(dir);
  console.log("  PASS");
}
