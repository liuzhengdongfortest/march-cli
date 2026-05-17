import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { runAuthStorageSmoke } from "./auth-storage.smoke.mjs";
import { runCliCommandSuiteSmoke } from "./cli-command-suite.smoke.mjs";
import { runContextSessionStatusSmoke } from "./context-session-status.smoke.mjs";
import { runCommandExecToolSmoke } from "./command-exec-tool.smoke.mjs";
import { runConfigLoadingSmoke } from "./config-loading.smoke.mjs";
import { runContextEngineSmoke } from "./context-engine.smoke.mjs";
import { runProjectContextSmoke } from "./context-project-context.smoke.mjs";
import { runCopyCommandSmoke } from "./copy-command.smoke.mjs";
import { runContextStatsToolSmoke } from "./context-stats-tool.smoke.mjs";
import { runEditFileToolSmoke } from "./edit-file-tool.smoke.mjs";
import { runExtensionDiscoverySmoke } from "./extension-discovery.smoke.mjs";
import { runExtensionLifecycleAdapterSmoke } from "./extension-lifecycle-adapter.smoke.mjs";
import { runExtensionLifecycleManifestSmoke } from "./extension-lifecycle-manifest.smoke.mjs";
import { runExternalEditorSmoke } from "./external-editor.smoke.mjs";
import { runFindToolSmoke } from "./find-tool.smoke.mjs";
import { runImageSmokeSuite } from "./image-smoke-suite.smoke.mjs";
import { runImageGenSmoke } from "./image-gen.smoke.mjs";
import { runInputHistorySmoke } from "./input-history.smoke.mjs";
import { runKeybindingsSmoke } from "./keybindings.smoke.mjs";
import { runLoginCommandSmoke } from "./login-command.smoke.mjs";
import { runMarkdownMemorySmoke } from "./markdown-memory.smoke.mjs";
import { runMcpInjectionsSmoke } from "./mcp-injections.smoke.mjs";
import { runMemorySystemSmoke, runDiffAndUiSmoke } from "./memory-and-diff.smoke.mjs";
import { runModeStateSmoke } from "./mode-state.smoke.mjs";
import { runModelContextDumperSmoke } from "./model-context-dumper.smoke.mjs";
import { runNodePtyAdapterSmoke } from "./node-pty-adapter.smoke.mjs";
import { runPromptTemplatesSmoke } from "./prompt-templates.smoke.mjs";
import { runProviderConfigCommandSmoke } from "./provider-config-command.smoke.mjs";
import { runReadFileToolSmoke } from "./read-file-tool.smoke.mjs";
import { runRipgrepResolverSmoke } from "./ripgrep-resolver.smoke.mjs";
import { runRunnerCoreSmoke } from "./runner-core.smoke.mjs";
import { runSettingsCommandSmoke } from "./settings-command.smoke.mjs";
import { runPiSessionManagerFactorySmoke, runPiSessionSidecarSmoke, runPiSessionSidecarSyncSmoke, runPiSessionTranscriptSmoke, runSessionPersistenceSmoke, runSessionTreeSmoke } from "./session.smoke.mjs";
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
import { runSuperGrokToolSmoke } from "./supergrok-tool.smoke.mjs";
import { runSyntaxHighlightingSmoke } from "./syntax-highlighting.smoke.mjs";
import { runTuiAutocompleteEscSmoke } from "./tui-autocomplete-esc.smoke.mjs";
import { runTuiSelectionSmoke } from "./tui-selection.smoke.mjs";
import { runTuiShellDrawerSmoke } from "./tui-shell-drawer.smoke.mjs";
import { runTurnNotifierSmoke } from "./turn-notifier.smoke.mjs";
import { runUserDisplayMessageSmoke } from "./user-display-message.smoke.mjs";
import { runWebSearchConfigCommandSmoke } from "./websearch-config-command.smoke.mjs";
import { runWebToolsSmoke } from "./web-tools.smoke.mjs";
import { FakeTerminal } from "./helpers/fake-terminal.mjs";

// Minimal mocks for smoke testing without DEEPSEEK_API_KEY

const verboseSmoke = process.env.MARCH_SMOKE_VERBOSE === "1";
const originalLog = console.log.bind(console);
const smokeLog = [];

if (!verboseSmoke) {
  console.log = (...args) => {
    smokeLog.push(args.map(String).join(" "));
  };
  const dumpSmokeLog = () => {
    if (smokeLog.length === 0) return;
    originalLog("\nSmoke log before failure:");
    for (const line of smokeLog) originalLog(line);
  };
  process.once("uncaughtException", dumpSmokeLog);
  process.once("unhandledRejection", dumpSmokeLog);
}

function setupTmp() {
  const dir = resolve(tmpdir(), `march-smoke-${randomUUID().slice(0, 8)}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 1. CLI args parsing ──────────────────────────────────────────────

{
  console.log("--- smoke: CLI args parsing ---");
  const { parseCliArgs, showHelp } = await import("../src/cli/args.mjs");

  const args = parseCliArgs(["-m", "deepseek-chat", "--json", "-e", "ext.ts", "hello world"]);
  assert.equal(args.model, "deepseek-chat");
  assert.equal(args.json, true);
  assert.deepEqual(args.extensions, ["ext.ts"]);
  assert.equal(args.prompt, "hello world");
  assert.equal(args.command, null);
  assert.equal(args.help, false);
  assert.equal(args.piSessions, false);
  assert.equal(args.piRuntimeHost, false);

  const piSessions = parseCliArgs(["--pi-sessions", "--pi-runtime-host", "--shell-runtime"]);
  assert.equal(piSessions.piSessions, true);
  assert.equal(piSessions.shellRuntime, true);

  const defaults = parseCliArgs([]);
  assert.equal(defaults.model, null);
  assert.equal(defaults.json, false);
  assert.equal(defaults.prompt, "");
  assert.equal(defaults.command, null);

  const explicitPermissionMode = parseCliArgs(["--permission-mode", "default"]);
  assert.equal(explicitPermissionMode.permissionMode, "default");

  const noShellRuntime = parseCliArgs(["--no-shell-runtime"]);
  assert.equal(noShellRuntime.shellRuntime, false);

  const dumpContext = parseCliArgs(["--dump-context"]);
  assert.equal(dumpContext.dumpContext, true);

  const providerConfig = parseCliArgs(["provider", "--config"]);
  assert.deepEqual(providerConfig.command, { name: "provider", args: [] });
  assert.equal(providerConfig.providerConfig, true);

  const websearchConfig = parseCliArgs(["websearch", "--config"]);
  assert.deepEqual(websearchConfig.command, { name: "websearch", args: [] });
  assert.equal(websearchConfig.providerConfig, true);

  const login = parseCliArgs(["login", "openai-codex"]);
  assert.deepEqual(login.command, { name: "login", args: ["openai-codex"] });
  assert.equal(login.prompt, "");

  assert.ok(!readFileSync("bin/march.mjs", "utf8").includes("process.exit("));
  assert.ok(!readFileSync("src/main.mjs", "utf8").includes("process.exit("));

  console.log("  PASS");
}

await runSourceLineLimitSmoke();
await runSourceDirectoryLimitSmoke();
await runStartupBannerSmoke();
await runStartupResumeSmoke({ setupTmp, cleanup });
await runAuthStorageSmoke({ setupTmp, cleanup });
await runLoginCommandSmoke();
await runImageSmokeSuite({ setupTmp, cleanup });
await runImageGenSmoke({ setupTmp, cleanup });
await runCopyCommandSmoke();
await runCommandExecToolSmoke();
await runCommandExecToolSmoke();
await runReadFileToolSmoke({ setupTmp, cleanup });
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
await runWebSearchConfigCommandSmoke({ setupTmp, cleanup });
await runWebToolsSmoke();
await runSuperGrokToolSmoke({ setupTmp, cleanup });
await runRipgrepResolverSmoke();
await runModelContextDumperSmoke({ setupTmp, cleanup });
await runInputHistorySmoke({ setupTmp, cleanup });
await runModeStateSmoke();
await runUserDisplayMessageSmoke();
await runTurnNotifierSmoke({ setupTmp, cleanup });
await runSessionNameCommandSmoke({ setupTmp, cleanup });
await runShellScreenBufferSmoke();
await runShellRuntimeSmoke();
await runShellDrawerSmoke();
await runShellSplitLayoutSmoke();
await runShellToolsSmoke();
await runNodePtyAdapterSmoke();
await runTuiShellDrawerSmoke({ setupTmp, cleanup });
await runTuiSelectionSmoke();

{
  console.log("--- smoke: TUI resize clears scrollback ---");
  const { createTuiUI } = await import("../src/cli/ui.mjs");
  const terminal = new FakeTerminal();
  terminal.columns = 40;
  terminal.rows = 6;
  const ui = createTuiUI({ terminal });
  ui.writeln("line1");
  ui.writeln("line2");
  ui.writeln("line3");
  ui.writeln("line4");
  ui.writeln("line5");
  ui.writeln("line6");
  await delay(50);
  terminal.writes = [];
  terminal.rows = 5;
  terminal.onResize?.();
  await delay(100);
  assert.ok(terminal.writes.join("").includes("\x1b[3J"));
  await ui.close();
  console.log("  PASS");
}

await runContextSessionStatusSmoke();
await runContextStatsToolSmoke({ setupTmp, cleanup });

await runConfigLoadingSmoke({ setupTmp, cleanup });
await runMcpInjectionsSmoke();
await runMarkdownMemorySmoke({ setupTmp, cleanup });

await runContextEngineSmoke({ setupTmp, cleanup });
await runProjectContextSmoke({ setupTmp, cleanup });

await runRunnerCoreSmoke();

// ── 3d. Autocomplete provider ───────────────────────────────────────

{
  console.log("--- smoke: autocomplete provider ---");
  const { buildMarchCommands, MarchAutocompleteProvider } = await import("../src/cli/input/autocomplete.mjs");
  const dir = setupTmp();
  writeFileSync(join(dir, "sample-file.txt"), "data");

  const commands = buildMarchCommands([{ name: "fix" }]);
  assert.ok(commands.some((command) => command.name === "hotkeys"));
  assert.ok(commands.some((command) => command.name === "templates"));
  assert.ok(commands.some((command) => command.name === "fix"));
  assert.ok(commands.some((command) => command.name === "models"));
  assert.ok(commands.some((command) => command.name === "session"));
  assert.ok(commands.some((command) => command.name === "thinking list"));
  assert.ok(commands.some((command) => command.name === "shell"));
  assert.ok(commands.some((command) => command.name === "shell spawn"));
  assert.equal(commands.find((command) => command.name === "session").description, "Open previous session selector");
  assert.ok(!commands.some((command) => command.name === "sessions"));
  assert.ok(!commands.some((command) => command.name === "resume"));
  assert.equal(commands.find((command) => command.name === "save").description, "Show auto-save status");

  const provider = new MarchAutocompleteProvider(commands, dir);
  const fileSuggestions = await provider.getSuggestions(["@sam"], 0, 4, {
    signal: new AbortController().signal,
  });
  assert.ok(fileSuggestions.items.some((item) => item.label.includes("sample-file.txt")));

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
  const { visibleWidth } = await import("@earendil-works/pi-tui");
  const { OutputBuffer } = await import("../src/cli/tui/output-buffer.mjs");
  const { renderMarkdown } = await import("../src/cli/tui/markdown-renderer.mjs");
  const { SafeRenderBoundary } = await import("../src/cli/tui/layout/safe-render-boundary.mjs");
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
  buffer.clear();
  assert.equal(stripAnsi(buffer.render(80).join("\n")), "");

  const markdown = new OutputBuffer();
  markdown.writeMarkdown("### 标题\n**1. Context 浪费严重 — 最大痛点**\n这里有 `edit` 和一段很长很长很长的正文");
  const markdownLines = markdown.render(20);
  const markdownRendered = markdownLines.join("\n");
  const plainMarkdown = stripAnsi(markdownRendered);
  assert.ok(markdownRendered.includes("\x1b[38;2;245;167;66m"));
  assert.ok(markdownRendered.includes("\x1b[38;2;127;216;143m"));
  assert.ok(!plainMarkdown.includes("###"));
  assert.ok(!plainMarkdown.includes("**"));
  assert.ok(!plainMarkdown.includes("`"));
  assert.ok(markdownLines.length > 3);

  const structuredMarkdown = new OutputBuffer();
  structuredMarkdown.writeMarkdown("- **交互更平滑**。Claude Code\n- **编辑体验**。March 的 `edit_file`\n\n| 维度 | 分数 | 说人话 |\n|------|------|--------|\n| 工具覆盖度 | ★★★★★ | 够用，不多不少 |");
  const structuredPlain = stripAnsi(structuredMarkdown.render(80).join("\n"));
  assert.ok(structuredPlain.includes("• 交互更平滑"));
  assert.ok(structuredPlain.includes("• 编辑体验"));
  assert.ok(structuredPlain.includes("维度"));
  assert.ok(structuredPlain.includes("工具覆盖度"));
  assert.ok(structuredPlain.includes("┌"));
  assert.ok(structuredPlain.includes("│"));
  assert.ok(structuredPlain.includes("├"));
  assert.ok(structuredPlain.includes("└"));
  assert.ok(!structuredPlain.includes("|------|"));

  const warningTableLines = renderMarkdown("| # | 结果 |\n|---|------|\n| 6 | ⚠️ 再次翻车 — 文本删除比预期少了，导致 addTask 签名重复、执行逻辑双份 |", 139);
  assert.ok(warningTableLines.every((line) => visibleWidth(line) <= 139));

  const codeMarkdown = new OutputBuffer();
  codeMarkdown.writeMarkdown("```js\nif (this.turns.length > 10) {\n  return this.turns.slice(-10);\n}\n```");
  const codeRendered = codeMarkdown.render(80).join("\n");
  const codePlain = stripAnsi(codeRendered);
  assert.ok(codePlain.includes("╭─ js"));
  assert.ok(codePlain.includes("│ if (this.turns.length > 10)"));
  assert.ok(codePlain.includes("╰"));
  assert.ok(!codePlain.split("\n").includes("js"));
  assert.ok(codeRendered.includes("\x1b[38;2;245;167;66mif\x1b[0m"));

  const plain = new OutputBuffer();
  plain.write("### plain `code`");
  assert.equal(plain.render(80).join("\n"), "### plain `code`");

  const dimmed = new OutputBuffer();
  dimmed.write("\x1b[2mabcdefghij\x1b[0m");
  const dimmedLines = dimmed.render(5);
  assert.equal(dimmedLines.length, 2);
  assert.ok(dimmedLines[0].startsWith("\x1b[2m"));
  assert.ok(dimmedLines[0].endsWith("\x1b[0m"));
  assert.ok(dimmedLines[1].startsWith("\x1b[2m"));
  assert.ok(dimmedLines[1].endsWith("\x1b[0m"));
  const sealed = new OutputBuffer();
  sealed.writeMarkdown("**done**");
  assert.equal(sealed.segments.length, 0);
  assert.equal(sealed.sealCurrentText(), true);
  assert.equal(sealed.segments.length, 1);
  assert.equal(sealed.segments[0].type, "markdown");
  assert.equal(sealed.segments[0].sealed, true);
  assert.ok(stripAnsi(sealed.render(80).join("\n")).includes("done"));

  const structuredBlock = new OutputBuffer();
  structuredBlock.addBlock({ type: "tool", lines: ["tool line"] });
  assert.equal(structuredBlock.segments[0].type, "tool");
  assert.ok(structuredBlock.render(80).join("\n").includes("tool line"));

  const multilineStatus = new OutputBuffer();
  multilineStatus.setOverlayStatus(["first\nsecond"]);
  assert.deepEqual(stripAnsi(multilineStatus.render(80).join("\n")).split("\n"), ["", "first", "second"]);

  const safeBoundary = new SafeRenderBoundary({ render: () => ["one\ntwo", "x".repeat(20)] });
  const safeLines = safeBoundary.render(5);
  assert.deepEqual(safeLines.slice(0, 2), ["one", "two"]);
  assert.ok(safeLines.every((line) => visibleWidth(line) <= 5));

  const recoveredLines = new SafeRenderBoundary({ render: () => { throw new Error("bad render"); } }).render(20);
  assert.ok(stripAnsi(recoveredLines.join("\n")).includes("March UI recovered"));
  assert.ok(recoveredLines.every((line) => visibleWidth(line) <= 20));

  const overlay = new OutputBuffer();
  overlay.setOverlayStatus(["loading"]);
  assert.ok(overlay.render(80).join("\n").includes("loading"));
  overlay.write("done");
  assert.ok(!overlay.render(80).join("\n").includes("loading"));

  const streaming = new OutputBuffer();
  streaming.writeMarkdown("first paragraph\n\n```js\nconst a = 1;\n```");
  const streamingPlain = stripAnsi(streaming.render(80).join("\n"));
  assert.ok(streamingPlain.includes("first paragraph"));
  assert.ok(streamingPlain.includes("const a = 1"));

  const scrollable = new OutputBuffer();
  for (let i = 1; i <= 12; i += 1) scrollable.writeln(`line${i}`);
  scrollable.setViewportHeight(4);
  assert.deepEqual(stripAnsi(scrollable.render(80).join("\n")).split("\n"), ["line10", "line11", "line12", ""]);
  scrollable.scroll(-1);
  scrollable.scroll(-1);
  assert.equal(scrollable.scrollOffset, 2);
  assert.deepEqual(stripAnsi(scrollable.render(80).join("\n")).split("\n"), ["line8", "line9", "line10", "line11"]);
  for (let i = 13; i <= 15; i += 1) scrollable.writeln(`line${i}`);
  assert.deepEqual(stripAnsi(scrollable.render(80).join("\n")).split("\n"), ["line8", "line9", "line10", "line11"]);
  scrollable.scroll(1);
  assert.equal(scrollable.scrollOffset, 4);

  const fastScroll = new OutputBuffer();
  for (let i = 1; i <= 30; i += 1) fastScroll.writeln(`line${i}`);
  fastScroll.setViewportHeight(12);
  fastScroll.render(80);
  fastScroll.scroll(-1);
  assert.equal(fastScroll.scrollOffset, 4);
  console.log("  PASS");
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

await runSyntaxHighlightingSmoke();

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

// ── 3j. CLI command suite ───────────────────────────────────────────

await runCliCommandSuiteSmoke({ setupTmp, cleanup });

// ── 4. Session smoke ────────────────────────────────────────────────

await runSessionPersistenceSmoke({ setupTmp, cleanup });
await runPiSessionManagerFactorySmoke({ setupTmp, cleanup });
await runPiSessionSidecarSmoke({ setupTmp, cleanup });
await runPiSessionSidecarSyncSmoke({ setupTmp, cleanup });
await runPiSessionTranscriptSmoke({ setupTmp, cleanup });
await runSessionTreeSmoke();

// ── 5. Memory, diff and UI API smoke ────────────────────────────────

await runMemorySystemSmoke({ setupTmp, cleanup });
await runDiffAndUiSmoke();

originalLog("All smoke tests passed.");
