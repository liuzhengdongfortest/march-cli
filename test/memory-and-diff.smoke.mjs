import { strict as assert } from "node:assert";

export async function runMemorySystemSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: memory system ---");
  const dir = setupTmp();

  try {
    const { MarkdownMemoryStore } = await import("../src/memory/markdown-store.mjs");
    const { KeywordVectorizer } = await import("./semantic-test-vectorizer.mjs");
    const store = new MarkdownMemoryStore({
      root: dir,
      now: () => new Date("2026-05-21T10:00:00.000Z"),
      semanticVectorizer: new KeywordVectorizer(["markdown", "files", "recall", "terms"]),
    });

    try {
      const entry = store.save({
        name: "Memory smoke",
        description: "Current memory system smoke coverage.",
        body: "# Memory smoke\n\nThe current memory system stores markdown files and indexes recall terms.",
        tags: ["memory-system", "smoke"],
      });
      assert.ok(entry.id.startsWith("mem_"));

      const searchResults = store.searchRipgrep("markdown files", { limit: 5 });
      assert.ok(searchResults.some((item) => item.path.endsWith(`${entry.id}.md`)));

      const opened = store.open(entry.id);
      assert.equal(opened.entry.id, entry.id);
      assert.ok(opened.content.includes("# Memory smoke"));

      store.beginTurn();
      const hints = await store.recallForUser("markdown files recall terms", { currentProject: "march-cli" });
      assert.equal(hints.length, 1);
      assert.equal(hints[0].id, entry.id);
      assert.equal((await store.recallForAssistant("memory system smoke")).length, 0);
      store.endTurn();
    } finally {
      store.close();
    }
  } finally {
    cleanup(dir);
  }
  console.log("  PASS");
}

export async function runDiffAndUiSmoke() {
  console.log("--- smoke: diff formatting ---");
  const { formatDiff } = await import("../src/agent/file-edit-tool.mjs");
  const diff = formatDiff("a\nold\nc", "a\nnew\nc");
  assert.ok(diff.some((line) => line.type === "del" && line.text === "old"));
  assert.ok(diff.some((line) => line.type === "add" && line.text === "new"));

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
  assert.equal(typeof ui.retryStart, "function");
  assert.equal(typeof ui.retryEnd, "function");
  assert.equal(typeof ui.setCtrlTHandler, "function");
  assert.equal(typeof ui.setCtrlLHandler, "function");
  assert.equal(typeof ui.close, "function");
  await ui.close();
  console.log("  PASS");
}
