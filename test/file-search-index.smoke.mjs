import { strict as assert } from "node:assert";

export async function runFileSearchIndexSmoke() {
  console.log("--- smoke: file search index ---");
  const { FileSearchIndex } = await import("../src/cli/input/file-search/index.mjs");

  let calls = 0;
  let now = 1_000;
  const index = new FileSearchIndex("/tmp/project", {
    now: () => now,
    cacheMs: 1_000,
    listFiles: async () => {
      calls += 1;
      return [
        "src/shallow.txt",
        "src/very/deep/path/target-file.ts",
        "docs/target-guide.md",
        "packages/core/src/FileSearchIndex.ts",
      ];
    },
  });

  const deepMatches = await index.search("target", { limit: 10 });
  assert.ok(deepMatches.some((item) => item.description === "src/very/deep/path/target-file.ts"));
  assert.ok(deepMatches.some((item) => item.description === "docs/target-guide.md"));

  const fuzzyMatches = await index.search("fsi", { limit: 10 });
  assert.ok(fuzzyMatches.some((item) => item.description === "packages/core/src/FileSearchIndex.ts"));

  const directoryMatches = await index.search("very/deep", { limit: 10, displayDotSlash: true });
  assert.ok(directoryMatches.some((item) => item.value === "@./src/very/deep/"));

  await index.search("target", { limit: 10 });
  assert.equal(calls, 1);
  now += 1_001;
  await index.search("target", { limit: 10 });
  assert.equal(calls, 2);

  console.log("  PASS");
}
