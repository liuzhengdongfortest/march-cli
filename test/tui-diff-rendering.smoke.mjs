import { strict as assert } from "node:assert";

export async function runTuiDiffRenderingSmoke() {
  console.log("--- smoke: TUI diff rendering ---");
  const { writeEditDiff } = await import("../src/cli/tui/tui-diff-rendering.mjs");

  const lines = [];
  writeEditDiff({
    output: { writeln: (line) => lines.push(line) },
    path: "src/app.js",
    diffLines: [
      { type: "ctx", text: "same" },
      { type: "del", text: "old" },
      { type: "add", text: "new" },
    ],
  });

  assert.equal(lines.length, 4);
  assert.ok(lines[0].includes("src/app.js"));
  assert.ok(lines[1].includes("same"));
  assert.ok(lines[2].includes("- old"));
  assert.ok(lines[3].includes("+ new"));
  assert.ok(lines[2].includes("\x1b[31m"));
  assert.ok(lines[3].includes("\x1b[32m"));

  const blocks = [];
  writeEditDiff({ output: { addBlock: (block) => blocks.push(block) }, path: "a.js", diffLines: [] });
  assert.equal(blocks[0].type, "diff");
  assert.ok(blocks[0].lines[0].includes("a.js"));
  console.log("  PASS");
}
