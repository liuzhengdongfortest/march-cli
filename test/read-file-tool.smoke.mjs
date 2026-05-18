import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runReadFileToolSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: read file tool ---");
  const { readFileSlice } = await import("../src/agent/file-tools/read-file-tool.mjs");
  const dir = setupTmp();
  const path = join(dir, "sample.txt");
  writeFileSync(path, "alpha\nbeta\ngamma\ndelta", "utf8");
  const engine = { resolvePath: (value) => value };

  const result = readFileSlice({ engine, path, offset: 2, limit: 2 });
  assert.ok(result.content[0].text.includes(`--- ${path} (lines 2-3 of 4) ---`));
  assert.ok(result.content[0].text.includes("2| beta"));
  assert.ok(result.content[0].text.includes("3| gamma"));
  assert.ok(result.content[0].text.includes("Use offset=4 to continue"));
  assert.equal(result.details.totalLines, 4);
  assert.equal(result.details.truncated, true);

  const nestedDir = join(dir, "nested");
  mkdirSync(nestedDir);
  mkdirSync(join(nestedDir, "child-dir"));
  writeFileSync(join(nestedDir, "child.txt"), "child", "utf8");
  const directoryResult = readFileSlice({ engine, path: nestedDir });
  assert.equal(directoryResult.details.error, undefined);
  assert.equal(directoryResult.details.isDirectory, true);
  assert.equal(directoryResult.details.entryCount, 2);
  assert.ok(directoryResult.content[0].text.includes("child-dir/"));
  assert.ok(directoryResult.content[0].text.includes("child.txt"));

  const emptyDir = join(dir, "empty");
  mkdirSync(emptyDir);
  const emptyDirectoryResult = readFileSlice({ engine, path: emptyDir });
  assert.ok(emptyDirectoryResult.content[0].text.includes("0 entries"));
  assert.ok(emptyDirectoryResult.content[0].text.includes("(empty directory)"));

  cleanup(dir);
  console.log("  PASS");
}
