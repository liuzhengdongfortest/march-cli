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
  const otherFile = join(dir, "other.txt");
  const lspService = {
    touchFile: (path) => touched.push(path),
    snapshot: () => ({
      status: "idle",
      diagnostics: [
        {
          serverId: "test-lsp",
          severity: 1,
          path: file,
          range: { start: { line: 1, character: 2 } },
          code: "E_TEST",
          message: "Current file diagnostic",
        },
        {
          serverId: "test-lsp",
          severity: 1,
          path: otherFile,
          range: { start: { line: 0, character: 0 } },
          message: "Other file diagnostic",
        },
      ],
    }),
  };

  let result = await executeEditFile({
    params: {
      path: file,
      edits: [{ type: "replace_range", startLine: 2, endLine: 3, newText: "TWO\nTHREE" }],
    },
    engine,
    ui,
    lspService,
  });
  assert.equal(result.details.error, undefined);
  assert.ok(result.content[0].text.includes("[diagnostics]"));
  assert.ok(result.content[0].text.includes("Current file diagnostic"));
  assert.ok(!result.content[0].text.includes("Other file diagnostic"));
  assert.equal(readFileSync(file, "utf8"), "one\nTWO\nTHREE\nfour");
  assert.equal(diffs.length, 1);
  assert.deepEqual(diffs[0].diff.map((line) => line.lineNum), [2, 3, 2, 3]);
  assert.deepEqual(touched, [file]);

  result = await executeEditFile({
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

  result = await executeEditFile({
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

  result = await executeEditFile({
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
  result = await executeEditFile({
    params: { path: newFile, mode: "write", content: "created" },
    engine,
    ui,
    lspService: { touchFile: (path) => touched.push(path) },
  });
  assert.equal(result.details.error, undefined);
  assert.ok(!result.content[0].text.includes("[diagnostics]"));
  assert.equal(readFileSync(newFile, "utf8"), "created");
  assert.ok(touched.includes(newFile));

  result = await executeEditFile({
    params: { path: newFile, mode: "write", content: "again" },
    engine,
    ui,
    lspService,
  });
  assert.equal(result.details.error, true);
  assert.equal(readFileSync(newFile, "utf8"), "created");

  result = await executeEditFile({
    params: { path: newFile, mode: "overwrite", content: "replaced" },
    engine,
    ui,
    lspService: {
      touchFile: (path) => touched.push(path),
      snapshot: () => ({
        status: "idle",
        diagnostics: [{
          serverId: "test-lsp",
          severity: 2,
          path: newFile,
          range: { start: { line: 0, character: 0 } },
          message: "New file warning",
        }],
      }),
    },
  });
  assert.equal(result.details.error, undefined);
  assert.ok(result.content[0].text.includes("[diagnostics]"));
  assert.ok(result.content[0].text.includes("New file warning"));
  assert.equal(readFileSync(newFile, "utf8"), "replaced");
  assert.ok(touched.includes(newFile));

  const multiFile = join(dir, "multi.txt");
  writeFileSync(multiFile, "alpha\nbeta\ngamma\ndelta", "utf8");
  const multiDiffs = [];
  result = await executeEditFile({
    params: {
      path: multiFile,
      edits: [
        { type: "replace_text", oldText: "beta", newText: "BETA" },
        { type: "replace_text", oldText: "delta", newText: "DELTA" },
      ],
    },
    engine,
    ui: { editDiff: (path, diff) => multiDiffs.push({ path, diff }) },
    lspService: { touchFile: (path) => touched.push(path) },
  });
  assert.equal(result.details.error, undefined);
  assert.equal(readFileSync(multiFile, "utf8"), "alpha\nBETA\ngamma\nDELTA");
  assert.equal(multiDiffs.length, 1);
  assert.ok(multiDiffs[0].diff.some((line) => line.type === "add" && line.text === "BETA"));
  assert.ok(multiDiffs[0].diff.some((line) => line.type === "add" && line.text === "DELTA"));

  cleanup(dir);
  console.log("  PASS");
}

function createEngine(cwd) {
  return {
    resolvePath: (path) => resolve(cwd, path),
  };
}
