import { strict as assert } from "node:assert";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export async function runMarkdownMemorySmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: markdown memory system ---");
  const { MarkdownMemoryStore, formatRecallHints } = await import("../src/memory/markdown-store.mjs");
  const { KeywordVectorizer } = await import("./semantic-test-vectorizer.mjs");
  const { ResilientVectorizer } = await import("../src/agent/code-search/retrieval/resilient-vectorizer.mjs");
  const { createMarkdownMemoryTools } = await import("../src/memory/markdown-tools.mjs");
  const { preloadSemanticMemoryRecall } = await import("../src/memory/markdown/semantic-preload.mjs");
  const { formatRecallLines, writeRecall } = await import("../src/cli/tui/recall-rendering.mjs");
  const dir = setupTmp();

  const warmupVectorizer = new KeywordVectorizer(["rolling", "suppression", "window"]);
  let preloaded = false;
  warmupVectorizer.load = async () => { preloaded = true; };
  const store = new MarkdownMemoryStore({
    root: dir,
    now: () => new Date("2026-05-14T10:30:00.000Z"),
    semanticVectorizer: warmupVectorizer,
  });
  const preloadStatuses = [];
  await preloadSemanticMemoryRecall({ memoryStore: store, ui: { status: (text) => preloadStatuses.push(text) } });
  assert.equal(preloaded, true);
  assert.deepEqual(preloadStatuses, ["Preparing memory recall model..."]);
  assert.equal(store.db.prepare("PRAGMA busy_timeout").get().timeout, 5000);

  assert.throws(() => store.save({ name: "No tags", description: "Missing tags", body: "Body" }), /tags are required/);

  const entry = store.save({
    name: "Recall hint dedup",
    description: "User recall uses a rolling suppression window.",
    body: "# Recall hint dedup\n\nThe body is only opened explicitly.",
    tags: ["memory/recall-hint", "memory/dedup", "Project/March CLI"],
  });

  assert.ok(entry.id.startsWith("mem_"));
  assert.deepEqual(entry.tags, ["memory/recall-hint", "memory/dedup", "project/march-cli"]);
  assert.match(relative(dir, entry.path), new RegExp(`^2026[\\\\/]05[\\\\/]week2[\\\\/]2026-05-14-${entry.id}\\.md$`));
  assert.ok(existsSync(store.indexPath));

  const legacyPath = join(dir, "2026-05-14-legacy-title.md");
  writeFileSync(legacyPath, `---\nid: mem_legacytitle\nname: Legacy title\ndescription: Legacy slug filenames remain readable.\nstatus: active\ncreated_at: 2026-05-14T10:30:00.000Z\nupdated_at: 2026-05-14T10:30:00.000Z\ntags:\n  - memory/legacy\n---\n\n# Legacy title\n\nOld slug-based memory files still scan.\n`, "utf8");
  store.scan({ force: true });
  assert.equal(store.open("mem_legacytitle").path, legacyPath);

  store.beginTurn();
  const userHints = await store.recallForUser("我们继续讨论 rolling suppression window", { currentProject: "march-cli" });
  assert.equal(userHints.length, 1);
  assert.equal(userHints[0].id, entry.id);
  assert.ok(formatRecallHints(userHints).includes("[recall]"));
  assert.ok(formatRecallHints(userHints).includes("score=1.00"));
  const userRecallReport = store.lastUserRecallReport;
  assert.equal(userRecallReport.threshold, 0.3);
  assert.equal(userRecallReport.candidates[0].recalled, true);
  assert.deepEqual(formatRecallLines(userHints, userRecallReport), [
    "✦ Memory Recall · 1 note · threshold 0.30",
    "  ✓ 1.00 Recall hint dedup",
    "    User recall uses a rolling suppression window.",
  ]);
  assert.deepEqual(formatRecallLines([userHints[0], { id: "mem_other", name: "Other memory" }]), [
    "✦ Memory Recall · 2 notes",
    "  ✓ 1.00 Recall hint dedup",
    "    User recall uses a rolling suppression window.",
    "  ✓ -- Other memory",
  ]);
  const renderedHints = [];
  writeRecall({ output: { writeln: (line) => renderedHints.push(line) }, hints: userHints, report: userRecallReport });
  assert.equal(renderedHints[0], "✦ Memory Recall · 1 note · threshold 0.30");
  assert.match(renderedHints[2], /^\x1b\[90m    User recall/);

  const assistantMissAfterUserRecall = await store.recallForAssistant("rolling suppression window");
  assert.equal(assistantMissAfterUserRecall.hints.length, 0);
  assert.equal(assistantMissAfterUserRecall.report.candidates.length, 0);
  store.endTurn();

  store.beginTurn();
  const assistantSemanticRecall = await store.recallForAssistant("rolling suppression window");
  assert.equal(assistantSemanticRecall.hints.length, 1);
  assert.equal(assistantSemanticRecall.hints[0].id, entry.id);
  assert.ok(Math.abs(assistantSemanticRecall.hints[0].score - 1) < 1e-9);
  assert.deepEqual(formatRecallLines(assistantSemanticRecall.hints, assistantSemanticRecall.report, { variant: "assistant" }), [
    "✦ Memory Recall · 1 note · threshold 0.30",
    "  ✓ 1.00 Recall hint dedup",
  ]);
  store.endTurn();

  store.semanticRecall.minScore = 0.9;
  const belowThreshold = await store.recallForUser("rolling", { currentProject: "march-cli" });
  assert.equal(belowThreshold.length, 0);
  assert.equal(store.lastUserRecallReport.candidates[0].recalled, false);
  assert.deepEqual(formatRecallLines(belowThreshold, store.lastUserRecallReport).slice(0, 2), [
    "✦ Memory Recall · 0 notes · threshold 0.90",
    "  × 0.58 Recall hint dedup",
  ]);
  store.semanticRecall.minScore = 0.3;
  store.semanticRecall.vectorizer = new ResilientVectorizer({
    primary: new FailingVectorizer(),
    fallback: new KeywordVectorizer(["rolling", "suppression", "window"]),
    label: "memory recall",
  });
  const fallbackHints = await store.recallForUser("rolling suppression window");
  assert.equal(fallbackHints.length, 1);
  assert.equal(store.lastUserRecallReport.vectorizerStatus, "fallback");
  assert.match(store.lastUserRecallReport.warning, /using local hashing fallback|fixture download failed/);
  assert.ok(formatRecallLines(fallbackHints, store.lastUserRecallReport)[0].includes("fallback"));
  store.semanticRecall.vectorizer = warmupVectorizer;

  store.beginTurn();
  const suppressed = await store.recallForUser("rolling suppression", { currentProject: "march-cli", excludedIds: [entry.id] });
  assert.equal(suppressed.length, 0);
  const recalledAfterTurn = await store.recallForUser("rolling suppression", { currentProject: "march-cli" });
  assert.equal(recalledAfterTurn.length, 1);
  store.endTurn();

  const miss = await store.recallForAssistant("completely unrelated text");
  assert.equal(miss.hints.length, 0);
  assert.deepEqual(formatRecallLines(miss.hints, miss.report, { variant: "assistant" }), [
    "✦ Memory Recall · 0 notes · threshold 0.30",
    "  no candidates",
  ]);

  const tools = createMarkdownMemoryTools(store);
  const search = tools.find((tool) => tool.name === "memory_search");
  const open = tools.find((tool) => tool.name === "memory_open");
  const save = tools.find((tool) => tool.name === "memory_save");
  const del = tools.find((tool) => tool.name === "memory_delete");

  const searchResult = await search.execute("t1", { query: "explicitly", limit: 5 });
  assert.ok(searchResult.content[0].text.includes("explicitly"));

  const idMiss = await search.execute("t1b", { query: "mem_missing", limit: 5 });
  assert.ok(idMiss.content[0].text.includes("literal ripgrep"));
  assert.ok(idMiss.content[0].text.includes("Use memory_open({ id })"));

  const deprecated = store.save({
    name: "Deprecated memory",
    description: "Deprecated memories are excluded from search.",
    body: "# Deprecated memory\n\ndeprecated-only search text",
    tags: ["memory/deprecated"],
  });
  writeFileSync(deprecated.path, readFileSync(deprecated.path, "utf8").replace("status: active", "status: deprecated"), "utf8");
  store.scan({ force: true });
  const deprecatedSearch = await search.execute("t4", { query: "deprecated-only", limit: 5 });
  assert.ok(deprecatedSearch.content[0].text.includes("No memory files matched"));

  const openResult = await open.execute("t2", { id: entry.id });
  assert.ok(openResult.content[0].text.includes(`path: ${entry.path}`));
  assert.ok(openResult.content[0].text.includes("Use edit_file with this path for targeted edits."));
  assert.ok(openResult.content[0].text.includes("content:\n---\n"));
  assert.ok(!openResult.content[0].text.includes("\n---\n---\n"));
  assert.ok(openResult.content[0].text.includes("# Recall hint dedup"));

  const typoId = `${entry.id.slice(0, -1)}${entry.id.endsWith("a") ? "b" : "a"}`;
  const typoOpenResult = await open.execute("t2b", { id: typoId });
  assert.ok(typoOpenResult.content[0].text.includes(`matched id: ${entry.id} (requested: ${typoId})`));
  assert.ok(typoOpenResult.content[0].text.includes("# Recall hint dedup"));
  const saveResult = await save.execute("t3", { id: entry.id, tags: ["memory/memory-hint", "memory/window"] });
  assert.ok(saveResult.content[0].text.includes("memory/window"));

  const deleteResult = await del.execute("t5", { id: entry.id });
  assert.ok(deleteResult.content[0].text.includes(`Deleted ${entry.id}`));
  assert.equal(deleteResult.details.memory.status, "deleted");
  assert.ok(existsSync(entry.path));
  assert.ok(readFileSync(entry.path, "utf8").includes("status: deleted"));
  assert.equal((await store.recallForAssistant("recall hint window")).hints.length, 0);
  const deletedSearch = await search.execute("t6", { query: "Recall hint dedup", limit: 5 });
  assert.ok(deletedSearch.content[0].text.includes("No memory files matched"));
  const deletedOpen = await open.execute("t7", { id: entry.id });
  assert.ok(deletedOpen.content[0].text.includes("status: deleted"));
  const deleteAgain = await del.execute("t8", { path: entry.path });
  assert.ok(deleteAgain.content[0].text.includes("already deleted"));
  const deleteMissing = await del.execute("t9", {});
  assert.equal(deleteMissing.details.error, true);
  assert.ok(deleteMissing.content[0].text.includes("memory id or path is required"));

  store.close();
  const cachedStore = new MarkdownMemoryStore({ root: dir });
  assert.equal(cachedStore.entries.get(entry.id).name, "Recall hint dedup");
  cachedStore.close();

  cleanup(dir);
  console.log("  PASS");
}

class FailingVectorizer {
  constructor() {
    this.id = "failing-memory-vectorizer";
    this.dimensions = 256;
  }

  async encode() {
    throw new Error("fixture download failed");
  }
}
