import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { runAuthStorageSmoke } from "./auth-storage.smoke.mjs";
import { runContextRuntimeStatusSmoke } from "./context-runtime-status.smoke.mjs";
import { runContextSessionStatusSmoke } from "./context-session-status.smoke.mjs";
import { runContextSkillLayersSmoke } from "./context-skill-layers.smoke.mjs";
import { runCommandExecToolSmoke } from "./command-exec-tool.smoke.mjs";
import { runConfigLoadingSmoke } from "./config-loading.smoke.mjs";
import { runContextEngineSmoke } from "./context-engine.smoke.mjs";
import { runCopyCommandSmoke } from "./copy-command.smoke.mjs";
import { runContextStatsToolSmoke } from "./context-stats-tool.smoke.mjs";
import { runEditFileToolSmoke } from "./edit-file-tool.smoke.mjs";
import { runCliCommandSuiteSmoke } from "./cli-command-suite.smoke.mjs";
import { runDiffAndUiSmoke, runMemorySystemSmoke } from "./memory-and-diff.smoke.mjs";
import { runExtensionDiscoverySmoke } from "./extension-discovery.smoke.mjs";
import { runExtensionLifecycleAdapterSmoke } from "./extension-lifecycle-adapter.smoke.mjs";
import { runExtensionLifecycleManifestSmoke } from "./extension-lifecycle-manifest.smoke.mjs";
import { runExternalEditorSmoke } from "./external-editor.smoke.mjs";
import { runFindToolSmoke } from "./find-tool.smoke.mjs";
import { runImageSmokeSuite } from "./image-smoke-suite.smoke.mjs";
import { runInputHistorySmoke } from "./input-history.smoke.mjs";
import { runKeybindingsSmoke } from "./keybindings.smoke.mjs";
import { runLoginCommandSmoke } from "./login-command.smoke.mjs";
import { runModelContextDumperSmoke } from "./model-context-dumper.smoke.mjs";
import { runModeStateSmoke } from "./mode-state.smoke.mjs";
import { runMcpInjectionsSmoke } from "./mcp-injections.smoke.mjs";
import { runMarkdownMemorySmoke } from "./markdown-memory.smoke.mjs";
import { runNodePtyAdapterSmoke } from "./node-pty-adapter.smoke.mjs";
import { runOpenCloseFileToolsSmoke } from "./open-close-file-tools.smoke.mjs";
import { runPromptTemplatesSmoke } from "./prompt-templates.smoke.mjs";
import { runProviderConfigCommandSmoke } from "./provider-config-command.smoke.mjs";
import { runRipgrepResolverSmoke } from "./ripgrep-resolver.smoke.mjs";
import { runRunnerCoreSmoke } from "./runner-core.smoke.mjs";
import { runSettingsCommandSmoke } from "./settings-command.smoke.mjs";
import { runPiSessionManagerFactorySmoke, runPiSessionSidecarSmoke, runPiSessionSidecarSyncSmoke, runSessionPersistenceSmoke, runSessionTreeSmoke } from "./session.smoke.mjs";
import { runSessionNameCommandSmoke } from "./session-name-command.smoke.mjs";
import { runShellRuntimeSmoke } from "./shell-runtime.smoke.mjs";
import { runShellScreenBufferSmoke } from "./shell-screen-buffer.smoke.mjs";
import { runShellDrawerSmoke } from "./shell-drawer.smoke.mjs";
import { runShellSplitLayoutSmoke } from "./shell-split-layout.smoke.mjs";
import { runShellToolsSmoke } from "./shell-tools.smoke.mjs";
import { runSourceDirectoryLimitSmoke } from "./source-directory-limit.smoke.mjs";
import { runSourceLineLimitSmoke } from "./source-line-limit.smoke.mjs";
import { runStartupBannerSmoke } from "./startup-banner.smoke.mjs";
import { runStartupResumeSmoke } from "./startup-resume.smoke.mjs";
import { runSummaryUiSmoke } from "./summary-ui.smoke.mjs";
import { runTuiAutocompleteEscSmoke } from "./tui-autocomplete-esc.smoke.mjs";
import { runTuiShellDrawerSmoke } from "./tui-shell-drawer.smoke.mjs";
import { runUserDisplayMessageSmoke } from "./user-display-message.smoke.mjs";

// Minimal mocks for smoke testing without DEEPSEEK_API_KEY

function setupTmp() {
  const dir = resolve(tmpdir(), `march-smoke-${randomUUID().slice(0, 8)}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ── 1. CLI args parsing ──────────────────────────────────────────────

{
  console.log("--- smoke: CLI args parsing ---");
  const { parseCliArgs, showHelp } = await import("../src/cli/args.mjs");

  const args = parseCliArgs(["-m", "deepseek-chat", "--json", "--pin", "foo.js", "-e", "ext.ts", "hello world"]);
  assert.equal(args.model, "deepseek-chat");
  assert.equal(args.json, true);
  assert.deepEqual(args.pins, ["foo.js"]);
  assert.deepEqual(args.extensions, ["ext.ts"]);
  assert.equal(args.prompt, "hello world");
  assert.equal(args.command, null);
  assert.equal(args.help, false);
  assert.equal(args.piSessions, false);
  assert.equal(args.piRuntimeHost, false);
  assert.equal(args.piSessionDefaults, false);
  assert.equal(args.legacySessions, false);

  const piSessions = parseCliArgs(["--pi-sessions", "--pi-runtime-host", "--pi-session-defaults", "--legacy-sessions", "--shell-runtime"]);
  assert.equal(piSessions.piSessions, true);
  assert.equal(piSessions.piRuntimeHost, true);
  assert.equal(piSessions.piSessionDefaults, true);
  assert.equal(piSessions.legacySessions, true);
  assert.equal(piSessions.shellRuntime, true);

  const defaults = parseCliArgs([]);
  assert.equal(defaults.model, null);
  assert.equal(defaults.json, false);
  assert.deepEqual(defaults.skills, []);
  assert.equal(defaults.prompt, "");
  assert.equal(defaults.command, null);
  assert.equal(defaults.shellRuntime, true);
  assert.equal(defaults.permissionMode, "bypassPermissions");

  const explicitPermissionMode = parseCliArgs(["--permission-mode", "default"]);
  assert.equal(explicitPermissionMode.permissionMode, "default");

  const noShellRuntime = parseCliArgs(["--no-shell-runtime"]);
  assert.equal(noShellRuntime.shellRuntime, false);

  const dumpContext = parseCliArgs(["--dump-context"]);
  assert.equal(dumpContext.dumpContext, true);

  const providerConfig = parseCliArgs(["provider", "--config"]);
  assert.deepEqual(providerConfig.command, { name: "provider", args: [] });
  assert.equal(providerConfig.providerConfig, true);

  const login = parseCliArgs(["login", "openai-codex"]);
  assert.deepEqual(login.command, { name: "login", args: ["openai-codex"] });
  assert.equal(login.prompt, "");

  console.log("  PASS");
}

await runSourceLineLimitSmoke();
await runSourceDirectoryLimitSmoke();
await runStartupBannerSmoke();
await runStartupResumeSmoke({ setupTmp, cleanup });
await runAuthStorageSmoke({ setupTmp, cleanup });
await runLoginCommandSmoke();
await runImageSmokeSuite({ setupTmp, cleanup });
await runCopyCommandSmoke();
await runOpenCloseFileToolsSmoke({ setupTmp, cleanup });
await runCommandExecToolSmoke();
await runFindToolSmoke({ setupTmp, cleanup });
await runExternalEditorSmoke({ setupTmp, cleanup });
await runEditFileToolSmoke({ setupTmp, cleanup });
await runExtensionDiscoverySmoke({ setupTmp, cleanup });
await runExtensionLifecycleManifestSmoke({ setupTmp, cleanup });
await runExtensionLifecycleAdapterSmoke();
await runKeybindingsSmoke({ setupTmp, cleanup });
await runPromptTemplatesSmoke({ setupTmp, cleanup });
await runSettingsCommandSmoke({ setupTmp, cleanup });
await runProviderConfigCommandSmoke({ setupTmp, cleanup });
await runRipgrepResolverSmoke();
await runModelContextDumperSmoke({ setupTmp, cleanup });
await runInputHistorySmoke({ setupTmp, cleanup });
await runModeStateSmoke();
await runUserDisplayMessageSmoke();
await runSessionNameCommandSmoke({ setupTmp, cleanup });
await runShellScreenBufferSmoke();
await runShellRuntimeSmoke();
await runShellDrawerSmoke();
await runShellSplitLayoutSmoke();
await runShellToolsSmoke();
await runSummaryUiSmoke({ setupTmp, cleanup });
await runNodePtyAdapterSmoke();
await runTuiShellDrawerSmoke({ setupTmp, cleanup });
await runContextRuntimeStatusSmoke();
await runContextSessionStatusSmoke();
await runContextSkillLayersSmoke();
await runContextStatsToolSmoke({ setupTmp, cleanup });

await runConfigLoadingSmoke({ setupTmp, cleanup });
await runMcpInjectionsSmoke();
await runMarkdownMemorySmoke({ setupTmp, cleanup });

await runContextEngineSmoke({ setupTmp, cleanup });

await runRunnerCoreSmoke();

// ── 3d. Autocomplete provider ───────────────────────────────────────

{
  console.log("--- smoke: autocomplete provider ---");
  const { buildMarchCommands, MarchAutocompleteProvider } = await import("../src/cli/input/autocomplete.mjs");
  const dir = setupTmp();
  writeFileSync(join(dir, "sample-file.txt"), "data");

  const commands = buildMarchCommands([
    { name: "review", description: "Review code" },
  ], [{ name: "fix" }]);
  assert.ok(commands.some((command) => command.name === "hotkeys"));
  assert.ok(commands.some((command) => command.name === "templates"));
  assert.ok(commands.some((command) => command.name === "fix"));
  assert.ok(commands.some((command) => command.name === "fork"));
  assert.ok(commands.some((command) => command.name === "resume"));
  assert.ok(commands.some((command) => command.name === "thinking list"));
  assert.ok(commands.some((command) => command.name === "shell"));
  assert.ok(commands.some((command) => command.name === "shell spawn"));
  assert.ok(commands.some((command) => command.name === "skill:review"));
  assert.equal(commands.find((command) => command.name === "sessions").description, "List default pi JSONL sessions");
  assert.equal(commands.find((command) => command.name === "resume").description, "Resume a pi session by id");
  assert.equal(commands.find((command) => command.name === "save").description, "Show auto-save status");

  const provider = new MarchAutocompleteProvider(commands, dir);
  const fileSuggestions = await provider.getSuggestions(["@sam"], 0, 4, {
    signal: new AbortController().signal,
  });
  assert.ok(fileSuggestions.items.some((item) => item.label.includes("sample-file.txt")));

  const skillSuggestions = await provider.getSuggestions(["/skill:rev"], 0, 10, {
    signal: new AbortController().signal,
  });
  assert.ok(skillSuggestions.items.some((item) => item.value === "skill:review"));

  const shellSuggestions = await provider.getSuggestions(["/sh"], 0, 3, {
    signal: new AbortController().signal,
  });
  assert.ok(shellSuggestions.items.some((item) => item.value === "shell"));
  assert.ok(shellSuggestions.items.some((item) => item.value === "shell spawn"));

  cleanup(dir);
  console.log("  PASS");
}

await runTuiAutocompleteEscSmoke({ setupTmp, cleanup });

// ── 3e. Output buffer rendering ─────────────────────────────────────

{
  console.log("--- smoke: output buffer rendering ---");
  const { OutputBuffer } = await import("../src/cli/tui/output-buffer.mjs");
  const buffer = new OutputBuffer();
  buffer.write("hello");
  buffer.startThinking();
  buffer.appendThinking("reasoning line");
  buffer.endThinking(12);
  buffer.setSpinner(true, "Thinking...");
  const rendered = buffer.render(80).join("\n");
  assert.ok(rendered.includes("hello"));
  assert.ok(rendered.includes("thinking (12 tokens)"));
  assert.ok(rendered.includes("reasoning line"));
  assert.ok(rendered.includes("Thinking..."));

  const markdown = new OutputBuffer();
  markdown.writeMarkdown("### 标题\n**1. Context 浪费严重 — 最大痛点**\n这里有 `edit` 和一段很长很长很长的正文");
  const markdownLines = markdown.render(20);
  const markdownRendered = markdownLines.join("\n");
  const plainMarkdown = stripAnsi(markdownRendered);
  assert.ok(markdownRendered.includes("\x1b[38;2;245;167;66m标题\x1b[0m"));
  assert.ok(markdownRendered.includes("\x1b[38;2;245;167;66m1. Context"));
  assert.ok(markdownRendered.includes("\x1b[38;2;127;216;143medit\x1b[0m"));
  assert.ok(!plainMarkdown.includes("###"));
  assert.ok(!plainMarkdown.includes("**"));
  assert.ok(!plainMarkdown.includes("`"));
  assert.ok(markdownLines.length > 3);

  const plain = new OutputBuffer();
  plain.write("### plain `code`");
  assert.equal(plain.render(80).join("\n"), "### plain `code`");
  console.log("  PASS");
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

// ── 3f. Tool output extraction ──────────────────────────────────────

{
  console.log("--- smoke: tool output extraction ---");
  const { extractToolOutput } = await import("../src/cli/tool-output.mjs");
  assert.equal(extractToolOutput({ content: [{ type: "text", text: "a" }, { type: "image", data: "x" }, { type: "text", text: "b" }] }), "a\nb");
  assert.equal(extractToolOutput({ content: [] }), "");
  console.log("  PASS");
}

// ── 3g. Inline shell parsing ────────────────────────────────────────

{
  console.log("--- smoke: inline shell parsing ---");
  const { parseInlineShellInput } = await import("../src/cli/repl-commands.mjs");
  assert.deepEqual(parseInlineShellInput("hello"), { type: "none" });
  assert.deepEqual(parseInlineShellInput("! npm test"), { type: "command", command: "npm test", repeated: false });
  assert.deepEqual(parseInlineShellInput("!!", "npm test"), { type: "command", command: "npm test", repeated: true });
  assert.equal(parseInlineShellInput("!!").type, "error");
  assert.equal(parseInlineShellInput("!").type, "error");
  console.log("  PASS");
}

// ── 3h. Hotkeys panel ───────────────────────────────────────────────

{
  console.log("--- smoke: hotkeys panel ---");
  const { formatHotkeysPanel } = await import("../src/cli/repl-commands.mjs");
  const panel = formatHotkeysPanel({ modelSelector: "Ctrl+M" }, [{ type: "warning", message: "bad key" }]).join("\n");
  assert.ok(panel.includes("Turn control:"));
  assert.ok(panel.includes("Model and thinking:"));
  assert.ok(panel.includes("Editor and output:"));
  assert.ok(panel.includes("Shell pane:"));
  assert.ok(panel.includes("Esc"));
  assert.ok(panel.includes("Ctrl+C"));
  assert.ok(panel.includes("Ctrl+O"));
  assert.ok(panel.includes("Ctrl+M"));
  assert.ok(panel.includes("Ctrl+T"));
  assert.ok(panel.includes("Alt+V"));
  assert.ok(panel.includes("Keybinding diagnostics:"));
  assert.ok(panel.includes("bad key"));
  assert.ok(panel.includes("!!"));
  assert.ok(panel.includes("@"));
  console.log("  PASS");
}

// ── 3i. Skill invocation parsing ────────────────────────────────────

{
  console.log("--- smoke: skill invocation parsing ---");
  const { parseSkillInvocation } = await import("../src/cli/repl-commands.mjs");
  assert.deepEqual(parseSkillInvocation("hello"), { type: "none" });
  assert.deepEqual(parseSkillInvocation("/skill:review"), { type: "skill", name: "review", prompt: "" });
  assert.deepEqual(parseSkillInvocation("/skill:review check this"), { type: "skill", name: "review", prompt: "check this" });
  console.log("  PASS");
}

// ── 3j. CLI command suite ───────────────────────────────────────────

await runCliCommandSuiteSmoke({ setupTmp, cleanup });

// ── 4. Session smoke ────────────────────────────────────────────────

await runSessionPersistenceSmoke({ setupTmp, cleanup });
await runPiSessionManagerFactorySmoke({ setupTmp, cleanup });
await runPiSessionSidecarSmoke({ setupTmp, cleanup });
await runPiSessionSidecarSyncSmoke({ setupTmp, cleanup });
await runSessionTreeSmoke();

// ── 5. Memory, diff and UI API smoke ────────────────────────────────

await runMemorySystemSmoke({ setupTmp, cleanup });
await runDiffAndUiSmoke();

console.log("\nAll smoke tests passed.");
