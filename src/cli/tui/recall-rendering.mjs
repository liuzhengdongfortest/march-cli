import { brightBlack } from "./ui-theme.mjs";

const RECALL_ICON = "✦";

export function formatRecallLines(hints = []) {
  if (!hints.length) return [];
  const noun = hints.length === 1 ? "note" : "notes";
  return [
    `${RECALL_ICON} Memory Recall · ${hints.length} ${noun}`,
    ...hints.flatMap(formatHintLines),
  ];
}

export function writeRecall({ output, hints = [] }) {
  const lines = formatRecallLines(hints);
  lines.forEach((line) => {
    if (line.startsWith("    ")) output.writeln(brightBlack(line));
    else output.writeln(line);
  });
}

function formatHintLines(hint) {
  const title = hint.name || hint.id || "Untitled memory";
  const lines = [`  • ${title}`];
  if (hint.description) lines.push(`    ${hint.description}`);
  return lines;
}
