import { strict as assert } from "node:assert";

export async function runTuiDiffRenderingSmoke() {
  console.log("--- smoke: TUI diff rendering ---");
  const { writeEditDiff, formatEditDiffLines } = await import("../src/cli/tui/tui-diff-rendering.mjs");
  const { initializeTreeSitterHighlighting } = await import("../src/cli/tui/syntax/highlighting.mjs");
  await initializeTreeSitterHighlighting();

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
  assert.ok(stripAnsi(lines[2]).includes("- old"));
  assert.ok(stripAnsi(lines[3]).includes("+ new"));
  assert.ok(lines[2].includes("48;5;52"));
  assert.ok(lines[3].includes("48;5;22"));

  const blocks = [];
  writeEditDiff({ output: { addBlock: (block) => blocks.push(block) }, path: "a.js", diffLines: [] });
  assert.equal(blocks[0].type, "diff");
  assert.ok(blocks[0].lines[0].includes("a.js"));

  const { OutputBuffer } = await import("../src/cli/tui/output-buffer.mjs");
  const buffer = new OutputBuffer();
  buffer.addBlock({
    type: "diff",
    path: "src/app.ts",
    diffLines: [
      { type: "del", text: "const oldValue = 1;", lineNum: 1 },
      { type: "add", text: "const newValue = 2;", lineNum: 1 },
    ],
  });
  assert.ok(buffer.render(140).map(stripAnsi).join("\n").includes("newValue"));

  const split = formatEditDiffLines({
    path: "src/app.ts",
    width: 140,
    diffLines: [
      { type: "ctx", text: "const same = 1;", lineNum: 10 },
      { type: "del", text: "return oldValue;", lineNum: 11 },
      { type: "add", text: "return newValue;", lineNum: 11 },
      { type: "add", text: "validate();", lineNum: 12 },
    ],
  });
  const splitPlain = split.map(stripAnsi);
  assert.ok(splitPlain.some((line) => line.includes("return oldValue") && line.includes("return newValue")));
  assert.ok(splitPlain.some((line) => line.includes("validate()")));
  assert.ok(split.some((line) => line.includes("48;5;52")));
  assert.ok(split.some((line) => line.includes("48;5;22")));
  assert.ok(split.some((line) => line.includes("38;5;117")));
  console.log("  PASS");
}

function stripAnsi(text) {
  return String(text ?? "").replace(/\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
