import { extractToolOutput } from "../tool-output.mjs";
import { formatToolStartLine, formatToolSuccessSummary } from "../../agent/tool-summary.mjs";
import { dim, red } from "./ui-theme.mjs";

export { formatToolStartLine, formatToolSuccessSummary } from "../../agent/tool-summary.mjs";

const TOOL_BODY_LIMIT = 40;
const TOOL_ERROR_LIMIT = 6;

export function writeToolStart({ output, name, args }) {
  const block = createToolCardBlock({ name, args });
  writeStructuredLines(output, block);
  return block;
}

export function createToolCardBlock({ name, args }) {
  return {
    type: "tool-card",
    name,
    args,
    title: formatToolStartLine(name, args),
    state: "running",
    isError: false,
    summary: "running",
    bodyLines: [],
  };
}

export function writeToolEnd({
  output,
  name,
  isError,
  result,
  toolsExpanded = false,
  extractToolOutputImpl = extractToolOutput,
  toolBlock = null,
}) {
  const card = formatToolEndCard({ name, isError, result, extractToolOutputImpl });
  if (toolBlock?.type === "tool-card") {
    Object.assign(toolBlock, card, { expanded: toolsExpanded });
    return true;
  }

  const lines = renderToolEndFallbackLines({ name, card, toolsExpanded });
  if (!lines.length) return false;
  writeStructuredLines(output, { type: "tool", lines });
  return true;
}

function formatToolEndCard({ name, isError, result, extractToolOutputImpl }) {
  const out = extractToolOutputImpl(result);
  if (isError) {
    return {
      state: "done",
      isError: true,
      summary: "failed",
      bodyLines: out.split("\n").filter(Boolean).slice(0, TOOL_ERROR_LIMIT).map((line) => line.slice(0, 120)),
    };
  }

  const summary = formatToolSuccessSummary(name, result, out) || "done";
  return {
    state: "done",
    isError: false,
    summary,
    bodyLines: out ? out.split("\n").slice(0, TOOL_BODY_LIMIT).map((line) => line.slice(0, 120)) : [],
  };
}

function renderToolEndFallbackLines({ name, card, toolsExpanded }) {
  if (card.isError) {
    return [
      red(`  ◆ ${name} failed`),
      ...card.bodyLines.map((line) => red(`    ${line}`)),
    ];
  }
  if (!toolsExpanded) return card.summary && card.summary !== "done" ? [dim(`    ${card.summary}`)] : [];
  return card.bodyLines.map((line) => dim(`    ${line}`));
}

function writeStructuredLines(output, block) {
  if (typeof output.addBlock === "function") output.addBlock(block);
  else {
    const lines = block.lines ?? [dim(`  ${block.title}`)];
    for (const line of lines) output.writeln(line);
  }
}
