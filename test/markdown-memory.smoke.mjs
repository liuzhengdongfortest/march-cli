import { strict as assert } from "node:assert";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";

export async function runMarkdownMemorySmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: markdown memory system ---");
  const { MarkdownMemoryStore, formatRecallHints } = await import("../src/memory/markdown-store.mjs");
  const { createMarkdownMemoryTools } = await import("../src/memory/markdown-tools.mjs");
  const { formatRecallLines, writeRecall } = await import("../src/cli/tui/recall-rendering.mjs");
  const dir = setupTmp();

  const store = new MarkdownMemoryStore({
    root: dir,
    now: () => new Date("2026-05-14T10:30:00.000Z"),
  });
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
  assert.match(relative(dir, entry.path), /^2026[\\/]05[\\/]week2[\\/]2026-05-14-recall-hint-dedup\.md$/);
  assert.ok(existsSync(store.indexPath));

  store.beginTurn();
  const userHints = store.recallForUser("我们继续讨论 recall hint 的去重", { currentProject: "march-cli" });
  assert.equal(userHints.length, 1);
  assert.equal(userHints[0].id, entry.id);
  assert.ok(formatRecallHints("user", userHints).includes("[recall source=\"user\"]"));
  assert.deepEqual(formatRecallLines(userHints), [
    "✦ Memory Recall · 1 note",
    "  • Recall hint dedup",
    "    User recall uses a rolling suppression window.",
  ]);
  assert.deepEqual(formatRecallLines([userHints[0], { id: "mem_other", name: "Other memory" }]), [
    "✦ Memory Recall · 2 notes",
    "  • Recall hint dedup",
    "    User recall uses a rolling suppression window.",
    "  • Other memory",
  ]);
  const renderedHints = [];
  writeRecall({ output: { writeln: (line) => renderedHints.push(line) }, hints: userHints });
  assert.equal(renderedHints[0], "✦ Memory Recall · 1 note");
  assert.match(renderedHints[2], /^\x1b\[90m    User recall/);

  const assistantHints = store.recallForAssistant("recall hint dedup again", { currentProject: "march-cli" });
  assert.equal(assistantHints.length, 0);
  store.endTurn();

  store.beginTurn();
  const suppressed = store.recallForUser("recall hint", { currentProject: "march-cli", excludedIds: [entry.id] });
  assert.equal(suppressed.length, 0);
  const recalledAfterTurn = store.recallForUser("recall hint", { currentProject: "march-cli" });
  assert.equal(recalledAfterTurn.length, 1);
  store.endTurn();

  const miss = store.recallForAssistant("completely unrelated text");
  assert.equal(miss.length, 0);

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
  assert.ok(openResult.content[0].text.includes("# Recall hint dedup"));

  const saveResult = await save.execute("t3", { id: entry.id, tags: ["memory/memory-hint", "memory/window"] });
  assert.ok(saveResult.content[0].text.includes("memory/window"));

  const deleteResult = await del.execute("t5", { id: entry.id });
  assert.ok(deleteResult.content[0].text.includes(`Deleted ${entry.id}`));
  assert.equal(deleteResult.details.memory.status, "deleted");
  assert.ok(existsSync(entry.path));
  assert.ok(readFileSync(entry.path, "utf8").includes("status: deleted"));
  assert.equal(store.recallForAssistant("recall hint window", { currentProject: "march-cli" }).length, 0);
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
