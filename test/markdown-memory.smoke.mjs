import { strict as assert } from "node:assert";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export async function runMarkdownMemorySmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: markdown memory system ---");
  const { MarkdownMemoryStore, formatRecallHints } = await import("../src/memory/markdown-store.mjs");
  const { createMarkdownMemoryTools } = await import("../src/memory/markdown-tools.mjs");
  const dir = setupTmp();

  const store = new MarkdownMemoryStore({
    root: dir,
    now: () => new Date("2026-05-14T10:30:00.000Z"),
  });

  assert.throws(() => store.save({ name: "No tags", description: "Missing tags", body: "Body" }), /tags are required/);

  const entry = store.save({
    name: "Passive recall dedup",
    description: "User recall uses a rolling suppression window.",
    body: "# Passive recall dedup\n\nThe body is only opened explicitly.",
    tags: ["memory/passive-recall", "memory/dedup", "Project/March CLI"],
  });

  assert.ok(entry.id.startsWith("mem_"));
  assert.deepEqual(entry.tags, ["memory/passive-recall", "memory/dedup", "project/march-cli"]);
  assert.ok(existsSync(store.indexPath));

  store.beginTurn();
  const userHints = store.recallForUser("我们继续讨论 passive recall 的去重", { currentProject: "march-cli" });
  assert.equal(userHints.length, 1);
  assert.equal(userHints[0].id, entry.id);
  assert.ok(formatRecallHints("user", userHints).includes("[passive_recall source=\"user\"]"));

  const assistantHints = store.recallForAssistant("passive recall dedup again", { currentProject: "march-cli" });
  assert.equal(assistantHints.length, 0);
  store.endTurn();

  store.beginTurn();
  const suppressed = store.recallForUser("passive recall", { currentProject: "march-cli" });
  assert.equal(suppressed.length, 0);
  store.endTurn();

  const miss = store.recallForAssistant("completely unrelated text");
  assert.equal(miss.length, 0);

  const tools = createMarkdownMemoryTools(store);
  const search = tools.find((tool) => tool.name === "memory_search");
  const open = tools.find((tool) => tool.name === "memory_open");
  const save = tools.find((tool) => tool.name === "memory_save");

  const searchResult = await search.execute("t1", { query: "explicitly", limit: 5 });
  assert.ok(searchResult.content[0].text.includes("explicitly"));

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
  assert.ok(openResult.content[0].text.includes("# Passive recall dedup"));

  const saveResult = await save.execute("t3", { id: entry.id, tags: ["memory/passive-recall", "memory/window"] });
  assert.ok(saveResult.content[0].text.includes("memory/window"));

  store.close();
  const cachedStore = new MarkdownMemoryStore({ root: dir });
  assert.equal(cachedStore.entries.get(entry.id).name, "Passive recall dedup");
  cachedStore.close();

  cleanup(dir);
  console.log("  PASS");
}
