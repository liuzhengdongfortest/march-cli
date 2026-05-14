import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

  engine.openFile(file);
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
  assert.deepEqual(touched, [file]);

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
  const openFiles = new Map();
  return {
    resolvePath: (path) => resolve(cwd, path),
    isOpen: (path) => openFiles.has(path),
    getOpenFile: (path) => openFiles.get(path),
    openFile: (path) => {
      mkdirSync(cwd, { recursive: true });
      if (!existsSync(path)) throw new Error(`file not found: ${path}`);
      const content = readFileSync(path, "utf8");
      const entry = { content, lineCount: content.split("\n").length };
      openFiles.set(path, entry);
      return entry;
    },
  };
}
