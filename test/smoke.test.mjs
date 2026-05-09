import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { runModelCommandSmoke, runPiSessionCloneCommandSmoke, runPiSessionSwitchCommandSmoke, runSelectorListSmoke, runSessionCommandSmoke, runSessionListCommandSmoke, runSessionSwitchCommandSmoke } from "./command-smoke.mjs";
import { runDiffAndUiSmoke, runMemorySystemSmoke } from "./memory-and-diff.smoke.mjs";
import { runRuntimeFactorySmoke } from "./runtime-factory.smoke.mjs";
import { runRuntimeHostSmoke } from "./runtime-host.smoke.mjs";
import { runRunnerRuntimeHostSmoke } from "./runner-runtime-host.smoke.mjs";
import { runPiSessionForkCommandSmoke } from "./pi-session-fork-command.smoke.mjs";
import { runPiSessionForkResetSmoke } from "./pi-session-fork-reset.smoke.mjs";
import { runPiSessionManagerFactorySmoke, runPiSessionSidecarSmoke, runPiSessionSidecarSyncSmoke, runSessionPersistenceSmoke, runSessionTreeSmoke } from "./session.smoke.mjs";
import { runSessionOptionsSmoke } from "./session-options.smoke.mjs";
import { runSlashCommandSmoke } from "./slash-command.smoke.mjs";
import { runTurnEventsSmoke } from "./turn-events.smoke.mjs";

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

  const args = parseCliArgs(["-m", "deepseek-chat", "--json", "--pin", "foo.js", "hello world"]);
  assert.equal(args.model, "deepseek-chat");
  assert.equal(args.json, true);
  assert.deepEqual(args.pins, ["foo.js"]);
  assert.equal(args.prompt, "hello world");
  assert.equal(args.help, false);
  assert.equal(args.piSessions, false);
  assert.equal(args.piRuntimeHost, false);

  const piSessions = parseCliArgs(["--pi-sessions", "--pi-runtime-host"]);
  assert.equal(piSessions.piSessions, true);
  assert.equal(piSessions.piRuntimeHost, true);

  const defaults = parseCliArgs([]);
  assert.equal(defaults.model, "deepseek-v4-pro");
  assert.equal(defaults.json, false);
  assert.deepEqual(defaults.skills, []);
  assert.equal(defaults.prompt, "");

  console.log("  PASS");
}

// ── 2. Config loading ────────────────────────────────────────────────

{
  console.log("--- smoke: config loading ---");
  const { loadConfig } = await import("../src/config/loader.mjs");
  const dir = setupTmp();

  // No config files
  const empty = loadConfig(dir);
  assert.equal(empty.model, "deepseek-chat");
  assert.equal(empty.provider, "deepseek");
  assert.deepEqual(empty.skills, []);
  assert.deepEqual(empty.pins, []);

  // Project .marchrc
  writeFileSync(join(dir, ".marchrc"), JSON.stringify({ model: "test-model", skills: ["s1"], pins: ["p1"] }));
  const withRc = loadConfig(dir);
  assert.equal(withRc.model, "test-model");
  assert.deepEqual(withRc.skills, ["s1"]);
  assert.deepEqual(withRc.pins, ["p1"]);

  // .march/config overrides .marchrc
  const marchDir = join(dir, ".march");
  mkdirSync(marchDir, { recursive: true });
  writeFileSync(join(marchDir, "config"), JSON.stringify({ model: "override-model", pins: ["p2"] }));
  const withBoth = loadConfig(dir);
  assert.equal(withBoth.model, "override-model");
  assert.deepEqual(withBoth.pins.sort(), ["p1", "p2"].sort());

  cleanup(dir);
  console.log("  PASS");
}

// ── 3. Context engine ────────────────────────────────────────────────

{
  console.log("--- smoke: context engine ---");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const dir = setupTmp();

  const engine = new ContextEngine({
    cwd: dir,
    modelId: "test",
    provider: "deepseek",
    skills: [],
    pins: [],
  });

  // Build context without memory/graph
  const ctx = engine.buildContext("装備を確認する");
  assert.ok(ctx.includes("[system_core]"));
  assert.ok(ctx.includes("[injections]"));
  assert.ok(ctx.includes("[session_status]"));
  assert.ok(ctx.includes("[runtime_status]"));
  assert.ok(ctx.includes("[recent_chat]"));
  assert.ok(ctx.includes("(no prior turns)"));
  assert.ok(ctx.includes("Use write(path, content)"));
  assert.ok(!ctx.includes("write_file"));
  assert.ok(!ctx.includes("[memory]")); // no graph attached

  // Record a turn
  engine.recordTurn({ userMessage: "hello", summary: "tested the engine" });
  assert.equal(engine.turns.length, 1);
  assert.equal(engine.turns[0].index, 1);

  const ctx2 = engine.buildContext("装備を確認する");
  assert.ok(ctx2.includes("tested the engine"));

  // Pin and open file
  const testFile = join(dir, "test.txt");
  writeFileSync(testFile, "line1\nline2\nline3");
  engine.addPin(testFile);
  const { content, lineCount, pinned } = engine.openFile(testFile);
  assert.equal(lineCount, 3);
  assert.equal(pinned, true);
  assert.equal(engine.getPins().length, 1);

  // Build context with open file
  const ctx3 = engine.buildContext("装備を確認する");
  assert.ok(ctx3.includes("[open_files]"));
  assert.ok(ctx3.includes("line1"));
  assert.ok(ctx3.includes("(pinned)"));

  // Close non-pinned file
  const testFile2 = join(dir, "test2.txt");
  writeFileSync(testFile2, "data");
  engine.openFile(testFile2);
  assert.equal(engine.openFiles.size, 2);
  engine.closeFile(testFile2);
  assert.equal(engine.openFiles.size, 1); // pinned file remains

  // Can't close pinned file
  assert.equal(engine.closeFile(testFile), false);

  // setToolDefs
  engine.setToolDefs([
    { name: "test_tool", description: "A test tool", parameters: { x: "number" } },
  ]);
  const ctx4 = engine.buildContext("装備を確認する");
  assert.ok(ctx4.includes("[tools]"));
  assert.ok(ctx4.includes("test_tool"));

  cleanup(dir);
  console.log("  PASS");
}

// ── 3b. Memory layer builder ────────────────────────────────────────

{
  console.log("--- smoke: memory layer builder ---");
  const { buildMemoryLayer } = await import("../src/context/memory-layer.mjs");
  const touched = [];
  const graph = {
    getChildren: () => [{ child_uuid: "u1", path: "boot-note", domain: "project", name: "boot-note" }],
    getMemoryByPath: () => ({ content: "boot content" }),
    touchNode: (uuid) => touched.push(uuid),
  };
  const layer = buildMemoryLayer({ graph, glossary: null, turns: [], namespace: "ns", userMessage: "" });
  assert.ok(layer.includes("[memory]"));
  assert.ok(layer.includes("boot content"));
  assert.deepEqual(touched, ["u1"]);
  console.log("  PASS");
}

// ── 3c. March tool set ───────────────────────────────────────────────

{
  console.log("--- smoke: March tool set ---");
  const { MARCH_BASE_TOOL_NAMES } = await import("../src/agent/runner.mjs");
  assert.deepEqual(MARCH_BASE_TOOL_NAMES, ["read", "bash", "edit", "write", "grep", "find", "ls"]);
  console.log("  PASS");
}

// ── 3d. Runner session manager seam ─────────────────────────────────

{
  console.log("--- smoke: runner session manager seam ---");
  const { createDefaultSessionManager, resolveRunnerSessionManager } = await import("../src/agent/runner.mjs");
  const { createSessionBinding } = await import("../src/agent/session-binding.mjs");
  const manager = createDefaultSessionManager(process.cwd());
  assert.equal(manager.getCwd(), process.cwd());
  assert.equal(manager.isPersisted(), false);
  const injected = { id: "injected" };
  assert.equal(resolveRunnerSessionManager(process.cwd(), injected), injected);
  const binding = createSessionBinding({ id: "s1" });
  assert.equal(binding.get().id, "s1");
  assert.equal(binding.set({ id: "s2" }).id, "s2");
  assert.equal(binding.get().id, "s2");
  console.log("  PASS");
}

// ── 3d. Autocomplete provider ───────────────────────────────────────

{
  console.log("--- smoke: autocomplete provider ---");
  const { buildMarchCommands, MarchAutocompleteProvider } = await import("../src/cli/autocomplete.mjs");
  const dir = setupTmp();
  writeFileSync(join(dir, "sample-file.txt"), "data");

  const commands = buildMarchCommands([
    { name: "review", description: "Review code" },
  ]);
  assert.ok(commands.some((command) => command.name === "hotkeys"));
  assert.ok(commands.some((command) => command.name === "fork"));
  assert.ok(commands.some((command) => command.name === "resume"));
  assert.ok(commands.some((command) => command.name === "thinking list"));
  assert.ok(commands.some((command) => command.name === "skill:review"));

  const provider = new MarchAutocompleteProvider(commands, dir);
  const fileSuggestions = await provider.getSuggestions(["@sam"], 0, 4, {
    signal: new AbortController().signal,
  });
  assert.ok(fileSuggestions.items.some((item) => item.label.includes("sample-file.txt")));

  const skillSuggestions = await provider.getSuggestions(["/skill:rev"], 0, 10, {
    signal: new AbortController().signal,
  });
  assert.ok(skillSuggestions.items.some((item) => item.value === "skill:review"));

  cleanup(dir);
  console.log("  PASS");
}

// ── 3e. Output buffer rendering ─────────────────────────────────────

{
  console.log("--- smoke: output buffer rendering ---");
  const { OutputBuffer } = await import("../src/cli/output-buffer.mjs");
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
  console.log("  PASS");
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
  const panel = formatHotkeysPanel().join("\n");
  assert.ok(panel.includes("Ctrl+O"));
  assert.ok(panel.includes("Ctrl+L"));
  assert.ok(panel.includes("Ctrl+T"));
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

// ── 3j. Thinking command handling ───────────────────────────────────

{
  console.log("--- smoke: thinking command handling ---");
  const {
    buildThinkingSelectItems,
    formatThinkingLevels,
    handleThinkingCommand,
    parseThinkingCommand,
    selectThinkingByIndex,
  } = await import("../src/cli/thinking-command.mjs");

  assert.deepEqual(parseThinkingCommand("hello"), { type: "none" });
  assert.deepEqual(parseThinkingCommand("/thinking"), { type: "cycle" });
  assert.deepEqual(parseThinkingCommand("/thinking list"), { type: "list" });
  assert.deepEqual(parseThinkingCommand("/thinking high"), { type: "set", level: "high" });
  assert.deepEqual(parseThinkingCommand("/thinking 2"), { type: "select", index: 2 });
  assert.equal(parseThinkingCommand("/thinking invalid").type, "error");
  assert.deepEqual(formatThinkingLevels(["off", "medium"], "medium"), [
    "  1. off",
    "* 2. medium",
    "Use /thinking <index> to select.",
  ]);
  assert.deepEqual(buildThinkingSelectItems(["off", "medium"], "medium"), [
    { value: "0", label: "off", description: "", level: "off" },
    { value: "1", label: "medium", description: "current", level: "medium" },
  ]);

  let level = "medium";
  const runner = {
    cycleThinkingLevel: () => {
      level = "high";
      return level;
    },
    getAvailableThinkingLevels: () => ["off", "medium", "high"],
    getThinkingLevel: () => level,
    setThinkingLevel: (next) => {
      level = next;
      return level;
    },
  };
  assert.deepEqual(handleThinkingCommand({ type: "cycle" }, { runner }), ["thinking: high"]);
  assert.equal(selectThinkingByIndex(2, { runner }), "thinking: medium");
  assert.equal(selectThinkingByIndex(4, { runner }), "Error: thinking index out of range: 4");
  assert.deepEqual(handleThinkingCommand({ type: "set", level: "off" }, { runner }), ["thinking: off"]);
  assert.deepEqual(handleThinkingCommand({ type: "list" }, { runner }), [
    "* 1. off",
    "  2. medium",
    "  3. high",
    "Use /thinking <index> to select.",
  ]);
  console.log("  PASS");
}

// ── 3k. Command module handling ─────────────────────────────────────

await runSelectorListSmoke();
await runModelCommandSmoke();
await runSessionCommandSmoke();
await runSessionListCommandSmoke();
await runSessionSwitchCommandSmoke({ setupTmp, cleanup });
await runPiSessionSwitchCommandSmoke();
await runPiSessionCloneCommandSmoke({ setupTmp, cleanup });
await runPiSessionForkCommandSmoke();
await runPiSessionForkResetSmoke({ setupTmp, cleanup });

// ── 3l. Slash command handling ──────────────────────────────────────

await runSlashCommandSmoke({ setupTmp, cleanup });
await runSessionOptionsSmoke();
await runTurnEventsSmoke();
await runRuntimeFactorySmoke();
await runRuntimeHostSmoke();
await runRunnerRuntimeHostSmoke();

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
