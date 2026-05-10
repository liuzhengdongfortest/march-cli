import { strict as assert } from "node:assert";

export async function runToolRenderingSmoke() {
  console.log("--- smoke: tool rendering ---");
  const { writeToolEnd, writeToolStart } = await import("../src/cli/tool-rendering.mjs");

  const lines = [];
  const output = { writeln: (line) => lines.push(line) };
  writeToolStart({ output, name: "read", args: { path: "a".repeat(200) } });
  assert.ok(lines[0].includes("read"));
  assert.ok(lines[0].length < 150);

  const rendered = writeToolEnd({
    output,
    name: "bash",
    isError: false,
    result: {},
    extractToolOutputImpl: () => "1\n2\n3\n4\n5",
  });
  assert.equal(rendered, true);
  assert.ok(lines.some((line) => line.includes("… (1 more lines)")));

  const empty = writeToolEnd({
    output,
    name: "empty",
    isError: false,
    result: {},
    extractToolOutputImpl: () => "",
  });
  assert.equal(empty, false);

  writeToolEnd({
    output,
    name: "grep",
    isError: true,
    result: {},
    extractToolOutputImpl: () => Array.from({ length: 8 }, (_, index) => `err${index}`).join("\n"),
  });
  assert.ok(lines.some((line) => line.includes("grep failed")));
  assert.equal(lines.filter((line) => line.includes("err")).length, 6);
  console.log("  PASS");
}
