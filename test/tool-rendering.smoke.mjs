import { strict as assert } from "node:assert";

export async function runToolRenderingSmoke() {
  console.log("--- smoke: tool rendering ---");
  const { formatToolStartLine, formatToolSuccessSummary, writeToolEnd, writeToolStart } = await import("../src/cli/tui/tool-rendering.mjs");
  const { renderToolCardBlock } = await import("../src/cli/tui/output/tool-card-renderer.mjs");

  const lines = [];
  const output = { writeln: (line) => lines.push(line) };
  writeToolStart({ output, name: "read", args: { path: "D:\\repo\\src\\agent\\runtime\\runner-runtime-host.mjs", offset: 1, limit: 2000 } });
  assert.ok(lines[0].includes("→ read · src\\agent\\runtime\\runner-runtime-host.mjs · lines 1-2000"));
  assert.ok(lines[0].length < 150);
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

  assert.equal(formatToolSuccessSummary("memory_open", { details: { entry: { name: "Project Overview" } } }), "Project Overview");
  assert.equal(formatToolSuccessSummary("memory_open", { details: { path: "D:\\memories\\2026\\05\\project-overview.md" } }), "memories\\2026\\05\\project-overview.md");

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

  const blocks = [];
  writeToolStart({ output: { addBlock: (block) => blocks.push(block) }, name: "read", args: { path: "a.js" } });
  assert.equal(blocks[0].type, "tool-card");
  assert.ok(blocks[0].title.includes("read"));
  writeToolEnd({ output: { addBlock: (block) => blocks.push(block) }, name: "read", isError: false, result: {}, toolBlock: blocks[0], extractToolOutputImpl: () => "file body" });
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].summary, "done");

  const memoryBlocks = [];
  writeToolStart({ output: { addBlock: (block) => memoryBlocks.push(block) }, name: "memory_open", args: { id: "mem_123" } });
  writeToolEnd({
    output: { addBlock: (block) => memoryBlocks.push(block) },
    name: "memory_open",
    isError: false,
    result: { details: { entry: { name: "Project Overview" }, path: "D:\\memories\\project-overview.md" } },
    toolBlock: memoryBlocks[0],
    extractToolOutputImpl: () => "path: D:\\memories\\project-overview.md",
  });
  assert.equal(memoryBlocks.length, 1);
  assert.equal(memoryBlocks[0].summary, "Project Overview");
  assert.match(renderToolCardBlock(memoryBlocks[0], 80).join("\n"), /\x1b\[38;2;214;162;58m▸ ◆ memory_open/);
  const { OutputBuffer } = await import("../src/cli/tui/output-buffer.mjs");
  const buffer = new OutputBuffer();
  const block = writeToolStart({ output: buffer, name: "grep", args: { pattern: "needle", path: "src" } });
  writeToolEnd({ output: buffer, name: "grep", isError: false, result: { details: { results: [{}, {}] } }, toolBlock: block, extractToolOutputImpl: () => "a\nb" });
  let renderedCard = buffer.render(80).join("\n");
  assert.ok(renderedCard.includes("┃"));
  assert.ok(renderedCard.includes("2 matches"));
  assert.ok(!renderedCard.includes("a\nb"));
  buffer.setToolCardsExpanded(true);
  renderedCard = buffer.render(80).join("\n");
  assert.ok(renderedCard.includes("a"));
  assert.ok(renderedCard.includes("b"));
  console.log("  PASS");
}
