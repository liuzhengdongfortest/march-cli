import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

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

// ── 3b. March tool set ───────────────────────────────────────────────

{
  console.log("--- smoke: March tool set ---");
  const { MARCH_BASE_TOOL_NAMES } = await import("../src/agent/runner.mjs");
  assert.deepEqual(MARCH_BASE_TOOL_NAMES, ["read", "bash", "edit", "write", "grep", "find", "ls"]);
  console.log("  PASS");
}

// ── 3c. Autocomplete provider ───────────────────────────────────────

{
  console.log("--- smoke: autocomplete provider ---");
  const { buildMarchCommands, MarchAutocompleteProvider } = await import("../src/cli/ui.mjs");
  const dir = setupTmp();
  writeFileSync(join(dir, "sample-file.txt"), "data");

  const commands = buildMarchCommands([
    { name: "review", description: "Review code" },
  ]);
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

// ── 4. Session persistence ──────────────────────────────────────────

{
  console.log("--- smoke: session persistence ---");
  const { ContextEngine } = await import("../src/context/engine.mjs");
  const { saveSession, loadSession } = await import("../src/session/persist.mjs");
  const dir = setupTmp();
  const sessionDir = join(dir, "test-session");

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

  // Restore into a new engine
  const engine2 = new ContextEngine({
    cwd: dir,
    modelId: "test",
    provider: "deepseek",
    skills: [],
    pins: [],
  });
  engine2.restoreSession(loaded);
  assert.equal(engine2.turns.length, 2);
  assert.equal(engine2.getPins().length, 1);

  cleanup(dir);
  console.log("  PASS");
}

// ── 5. Memory system (SQLite, requires Node 24+) ─────────────────────

{
  console.log("--- smoke: memory system ---");
  const dir = setupTmp();
  const dbPath = join(dir, "memory.db");

  const { openDatabase, ROOT_NODE_UUID, addGlossaryKeyword } = await import("../src/memory/database.mjs");
  const db = openDatabase(dbPath);
  assert.ok(db);

  const { GraphService } = await import("../src/memory/graph.mjs");
  const { ChangesetStore } = await import("../src/memory/snapshot.mjs");
  const { SearchIndexer } = await import("../src/memory/search.mjs");

  const changesetStore = new ChangesetStore(db);
  const searchIndexer = new SearchIndexer(db);
  const graph = new GraphService(db, { changesetStore, searchIndexer });

  // Create a memory under root
  const result = graph.createMemory("", "test content", 0, { domain: "boot" });
  assert.ok(result);
  assert.ok(result.node_uuid);
  assert.ok(result.id);

  // Add glossary keyword via database.mjs function
  const nodeUuid = result.node_uuid;
  addGlossaryKeyword(db, "hello", nodeUuid);
  assert.ok(true); // no error = success

  // Search
  searchIndexer.index(nodeUuid, "test content with unique keywords", "boot");
  const results = searchIndexer.search("unique");
  assert.ok(results.length > 0);

  // Changeset recorded
  const history = changesetStore.getHistory(nodeUuid);
  assert.ok(history.length > 0);

  // Diagnostics
  const diag = graph.getDiagnostics();
  assert.ok(typeof diag === "object");

  db.close();
  cleanup(dir);
  console.log("  PASS");
}

// ── 6. diff formatting ───────────────────────────────────────────────

{
  console.log("--- smoke: diff formatting ---");
  // We can't import formatDiff directly (not exported), so test via edit scenario
  // Just verify the UI module exports all expected methods
  const ui = (await import("../src/cli/ui.mjs")).createUI({ json: false });
  assert.equal(typeof ui.readline, "function");
  assert.equal(typeof ui.write, "function");
  assert.equal(typeof ui.writeln, "function");
  assert.equal(typeof ui.toolStart, "function");
  assert.equal(typeof ui.toolEnd, "function");
  assert.equal(typeof ui.textDelta, "function");
  assert.equal(typeof ui.status, "function");
  assert.equal(typeof ui.turnStart, "function");
  assert.equal(typeof ui.turnEnd, "function");
  assert.equal(typeof ui.editDiff, "function");
  assert.equal(typeof ui.toggleToolOutput, "function");
  assert.equal(typeof ui.close, "function");
  ui.close();
  console.log("  PASS");
}

console.log("\nAll smoke tests passed.");
