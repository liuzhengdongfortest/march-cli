import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export async function runEditFileToolSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: edit_file unified tool ---");
  const { executeEditFile } = await import("../src/agent/file-edit-tool.mjs");
  const dir = setupTmp();
  const file = join(dir, "sample.txt");
  writeFileSync(file, "one\ntwo\nthree\nfour", "utf8");

  const touched = [];
  const diffs = [];
  const engine = createEngine(dir);
  const ui = { editDiff: (path, diff) => diffs.push({ path, diff }) };
  const lspService = { touchFile: (path) => touched.push(path) };

  let result = executeEditFile({
    params: {
      path: file,
      edits: [{ type: "replace_range", startLine: 2, endLine: 3, newText: "TWO\nTHREE" }],
    },
    engine,
    ui,
    lspService,
  });
  assert.equal(result.details.error, undefined);
  assert.equal(readFileSync(file, "utf8"), "one\nTWO\nTHREE\nfour");
  assert.equal(diffs.length, 1);
  assert.deepEqual(diffs[0].diff.map((line) => line.lineNum), [2, 3, 2, 3]);
  assert.deepEqual(touched, [file]);

  result = executeEditFile({
    params: {
      path: file,
      edits: [{ type: "replace_range", startLine: 2, endLine: 3, newText: "TWO\nTHREE\n" }],
    },
    engine,
    ui,
    lspService,
  });
  assert.equal(result.details.error, undefined);
  assert.equal(readFileSync(file, "utf8"), "one\nTWO\nTHREE\nfour");

  result = executeEditFile({
    params: {
      path: file,
      mode: "patch",
      edits: [{ type: "replace_text", oldText: "four", newText: "FOUR" }],
    },
    engine,
    ui,
    lspService,
  });
  assert.equal(result.details.error, undefined);
  assert.equal(readFileSync(file, "utf8"), "one\nTWO\nTHREE\nFOUR");

  result = executeEditFile({
    params: {
      path: file,
      mode: "patch",
      edits: [{ type: "replace_text", oldText: "THREE\nfour", newText: "changed" }],
    },
    engine,
    ui,
    lspService,
  });
  const missingText = result.content[0].text;
  assert.equal(result.details.error, true);
  assert.ok(missingText.includes("Closest candidate:"));
  assert.ok(missingText.includes("Use replace_range with startLine=3 endLine=4"));
  assert.equal(readFileSync(file, "utf8"), "one\nTWO\nTHREE\nFOUR");

  const newFile = join(dir, "nested", "new.txt");
  result = executeEditFile({
    params: { path: newFile, mode: "write", content: "created" },
    engine,
    ui,
    lspService,
  });
  assert.equal(result.details.error, undefined);
  assert.equal(readFileSync(newFile, "utf8"), "created");

  result = executeEditFile({
    params: { path: newFile, mode: "write", content: "again" },
    engine,
    ui,
    lspService,
  });
  assert.equal(result.details.error, true);
  assert.equal(readFileSync(newFile, "utf8"), "created");

  result = executeEditFile({
    params: { path: newFile, mode: "overwrite", content: "replaced" },
    engine,
    ui,
    lspService,
  });
  assert.equal(result.details.error, undefined);
  assert.equal(readFileSync(newFile, "utf8"), "replaced");

  cleanup(dir);
  console.log("  PASS");
}

function createEngine(cwd) {
  return {
    resolvePath: (path) => resolve(cwd, path),
  };
}
