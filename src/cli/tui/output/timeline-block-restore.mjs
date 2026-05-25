import { createToolCardBlock, writeToolEnd } from "../tool-rendering.mjs";
import { formatRecallLines } from "../recall-rendering.mjs";

export function restoreTimelineBlocksToOutputBuffer(output, blocks) {
  output.clear();
  for (const block of Array.isArray(blocks) ? blocks : []) appendTimelineBlock(output, block);
  output.invalidate?.();
}

function appendTimelineBlock(output, block) {
  if (!block || typeof block !== "object") return;
  switch (block.type) {
    case "assistant":
      if (block.content) output.addBlock({ type: "markdown", text: String(block.content), sealed: Boolean(block.closed), cache: new Map() });
      break;
    case "thinking":
      output.addBlock({ type: "thinking", tokens: block.tokens ?? 0, content: splitLines(block.content) });
      break;
    case "tool": {
      const card = createToolCardBlock({ name: block.name, args: block.args });
      output.addBlock(card);
      if (block.closed) writeToolEnd({ output, name: block.name, isError: block.isError, result: block.result, toolBlock: card });
      break;
    }
    case "output":
      if (block.newline) output.writeln(String(block.content ?? ""));
      else output.write(String(block.content ?? ""));
      break;
    case "status":
      output.addBlock({ type: "status", lines: [String(block.content ?? "")] });
      break;
    case "recall":
      output.addBlock({ type: "plain", lines: formatRecallLines(block.hints ?? []) });
      break;
    case "editDiff":
      output.addBlock({ type: "diff", path: block.path, diffLines: block.diffLines ?? [] });
      break;
    default:
      break;
  }
}

function splitLines(value) {
  return String(value ?? "").split("\n");
}
