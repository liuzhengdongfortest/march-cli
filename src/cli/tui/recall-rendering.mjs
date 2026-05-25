import { formatScore } from "../../memory/markdown/markdown-recall.mjs";
import { brightBlack } from "./ui-theme.mjs";

const RECALL_ICON = "✦";

export function formatRecallLines(hints = [], report = null, { variant = "user" } = {}) {
  if (variant === "assistant") return formatAssistantRecallLines(hints, report);
  const candidates = report?.candidates ?? [];
  if (!hints.length && !candidates.length) return [];
  const noun = hints.length === 1 ? "note" : "notes";
  const threshold = Number.isFinite(report?.threshold) ? ` · threshold ${formatScore(report.threshold)}` : "";
  const fallback = report?.vectorizerStatus === "fallback" ? " · fallback" : "";
  return [
    `${RECALL_ICON} Memory Recall · ${hints.length} ${noun}${threshold}${fallback}`,
    ...(report?.warning ? [`    ! ${report.warning}`] : []),
    ...(candidates.length ? candidates : hints.map((hint) => ({ ...hint, recalled: true }))).flatMap(formatHintLines),
  ];
}

export function writeRecall({ output, hints = [], report = null, variant = "user" }) {
  const lines = formatRecallLines(hints, report, { variant });
  lines.forEach((line) => {
    if (variant === "assistant" || line.startsWith("    ")) output.writeln(brightBlack(line));
    else output.writeln(line);
  });
}

function formatAssistantRecallLines(hints, report) {
  const candidates = (report?.candidates?.length ? report.candidates : hints.map((hint) => ({ ...hint, recalled: true }))).slice(0, 3);
  const noun = hints.length === 1 ? "note" : "notes";
  const threshold = Number.isFinite(report?.threshold) ? ` · threshold ${formatScore(report.threshold)}` : "";
  const fallback = report?.vectorizerStatus === "fallback" ? " · fallback" : "";
  return [
    `${RECALL_ICON} Memory Recall · ${hints.length} ${noun}${threshold}${fallback}`,
    ...(report?.warning ? [`  ! ${report.warning}`] : []),
    ...(candidates.length ? candidates.map(formatCompactHintLine) : ["  no candidates"]),
  ];
}

function formatCompactHintLine(hint) {
  const title = hint.name || hint.id || "Untitled memory";
  const mark = hint.recalled === false ? "×" : "✓";
  return `  ${mark} ${formatScore(hint.score)} ${title}`;
}

function formatHintLines(hint) {
  const title = hint.name || hint.id || "Untitled memory";
  const mark = hint.recalled === false ? "×" : "✓";
  const score = `${formatScore(hint.score)} `;
  const lines = [`  ${mark} ${score}${title}`];
  if (hint.description) lines.push(`    ${hint.description}`);
  return lines;
}
