import { strict as assert } from "node:assert";

export async function runToolRenderingSmoke() {
  console.log("--- smoke: tool rendering ---");
  const { formatToolStartLine, writeToolEnd, writeToolStart } = await import("../src/cli/tui/tool-rendering.mjs");

  const lines = [];
  const output = { writeln: (line) => lines.push(line) };
  writeToolStart({ output, name: "read", args: { path: "D:\\repo\\src\\agent\\runtime\\runner-runtime-host.mjs", offset: 1, limit: 2000 } });
  assert.equal(lines[0], "");
  assert.ok(lines[1].includes("→ read · src\\agent\\runtime\\runner-runtime-host.mjs · lines 1-2000"));
  assert.ok(lines[1].length < 150);
  assert.equal(formatToolStartLine("grep", { pattern: "onPayload|payload|agent", path: "test" }), "✱ grep · \"onPayload|payload|agent\" · test");
  assert.equal(formatToolStartLine("find", { pattern: "**/*.mjs", path: "src" }), "✱ find · \"**/*.mjs\" · src");
  assert.equal(formatToolStartLine("edit_file", { path: "test/session-name-command.smoke.mjs", edits: [{ newText: "very long\ntext" }] }), "◆ edit_file · test\\session-name-command.smoke.mjs · 1 edit");
  assert.equal(formatToolStartLine("terminal_send", { shell_id: "test-shell", text: "npm test", key: "enter" }), "◆ terminal_send · test-shell · text+enter");
  assert.equal(formatToolStartLine("unknown", { ok: true, deep: { noisy: "value" } }), "◆ unknown · ok=true");

  const collapsed = writeToolEnd({
    output,
    name: "bash",
    isError: false,
    result: {},
    extractToolOutputImpl: () => "1\n2\n3\n4\n5",
  });
  assert.equal(collapsed, false);
  assert.equal(lines.some((line) => line.includes("… (1 more lines)")), false);

  const grepSummary = writeToolEnd({
    output,
    name: "grep",
    isError: false,
    result: { details: { results: Array.from({ length: 58 }, () => ({})) } },
    extractToolOutputImpl: () => "ignored",
  });
  assert.equal(grepSummary, true);
  assert.ok(lines.some((line) => line.includes("58 matches")));

  const findSummary = writeToolEnd({
    output,
    name: "find",
    isError: false,
    result: { details: { count: 12 } },
    extractToolOutputImpl: () => "ignored",
  });
  assert.equal(findSummary, true);
  assert.ok(lines.some((line) => line.includes("12 files")));

  const rendered = writeToolEnd({
    output,
    name: "bash",
    isError: false,
    result: {},
    toolsExpanded: true,
    extractToolOutputImpl: () => "1\n2\n3\n4\n5",
  });
  assert.equal(rendered, true);
  assert.equal(lines.some((line) => line.includes("… (1 more lines)")), false);

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
