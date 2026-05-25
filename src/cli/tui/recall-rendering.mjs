import { formatScore } from "../../memory/markdown/markdown-recall.mjs";
import { brightBlack } from "./ui-theme.mjs";

const RECALL_ICON = "✦";

export function formatRecallLines(hints = [], report = null) {
  const candidates = report?.candidates ?? [];
  if (!hints.length && !candidates.length) return [];
  const noun = hints.length === 1 ? "note" : "notes";
  const threshold = Number.isFinite(report?.threshold) ? ` · threshold ${formatScore(report.threshold)}` : "";
  return [
    `${RECALL_ICON} Memory Recall · ${hints.length} ${noun}${threshold}`,
    ...(candidates.length ? candidates : hints.map((hint) => ({ ...hint, recalled: true }))).flatMap(formatHintLines),
  ];
}

export function writeRecall({ output, hints = [], report = null }) {
  const lines = formatRecallLines(hints, report);
  lines.forEach((line) => {
    if (line.startsWith("    ")) output.writeln(brightBlack(line));
    else output.writeln(line);
  });
}

function formatHintLines(hint) {
  const title = hint.name || hint.id || "Untitled memory";
  const mark = hint.recalled === false ? "×" : "✓";
  const score = Number.isFinite(hint.score) ? `${formatScore(hint.score)} ` : "";
  const lines = [`  ${mark} ${score}${title}`];
  if (hint.description) lines.push(`    ${hint.description}`);
  return lines;
}
