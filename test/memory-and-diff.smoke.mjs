import { strict as assert } from "node:assert";
import { join } from "node:path";

export async function runMemorySystemSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: memory system ---");
  const dir = setupTmp();
  const dbPath = join(dir, "memory.db");

  const { openDatabase, addGlossaryKeyword } = await import("../src/memory/database.mjs");
  const db = openDatabase(dbPath);
  assert.ok(db);

  const { GraphService } = await import("../src/memory/graph.mjs");
  const { ChangesetStore } = await import("../src/memory/snapshot.mjs");
  const { SearchIndexer } = await import("../src/memory/search.mjs");

  const changesetStore = new ChangesetStore(db);
  const searchIndexer = new SearchIndexer(db);
  const graph = new GraphService(db, { changesetStore, searchIndexer });

  const result = graph.createMemory("", "test content", 0, { domain: "boot" });
  assert.ok(result);
  assert.ok(result.node_uuid);
  assert.ok(result.id);

  const nodeUuid = result.node_uuid;
  addGlossaryKeyword(db, "hello", nodeUuid);
  assert.ok(true);

  searchIndexer.index(nodeUuid, "test content with unique keywords", "boot");
  const results = searchIndexer.search("unique");
  assert.ok(results.length > 0);

  const history = changesetStore.getHistory(nodeUuid);
  assert.ok(history.length > 0);

  const diag = graph.getDiagnostics();
  assert.ok(typeof diag === "object");

  db.close();
  cleanup(dir);
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
