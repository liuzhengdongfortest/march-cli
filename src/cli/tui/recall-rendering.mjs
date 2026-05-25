import { formatScore } from "../../memory/markdown/markdown-recall.mjs";
import { brightBlack } from "./ui-theme.mjs";

const RECALL_ICON = "✦";

export function formatRecallLines(hints = [], report = null, { variant = "user" } = {}) {
  if (variant === "assistant") return formatAssistantRecallLines(hints, report);
  const candidates = report?.candidates ?? [];
  const displayed = candidates.length ? candidates : hints.map((hint) => ({ ...hint, recalled: true }));
  if (!hints.length && !displayed.length) return [];
  const threshold = Number.isFinite(report?.threshold) ? ` · threshold ${formatScore(report.threshold)}` : "";
  const fallback = report?.vectorizerStatus === "fallback" ? " · fallback" : "";
  return [
    `${RECALL_ICON} Memory Recall · ${recallSummary(hints, displayed)}${threshold}${fallback}`,
    ...(report?.warning ? [`    ! ${report.warning}`] : []),
    ...displayed.flatMap(formatHintLines),
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
  const threshold = Number.isFinite(report?.threshold) ? ` · threshold ${formatScore(report.threshold)}` : "";
  const fallback = report?.vectorizerStatus === "fallback" ? " · fallback" : "";
  return [
    `${RECALL_ICON} Memory Recall · ${recallSummary(hints, report?.candidates ?? candidates)}${threshold}${fallback}`,
    ...(report?.warning ? [`  ! ${report.warning}`] : []),
    ...(candidates.length ? candidates.map(formatCompactHintLine) : ["  no candidates"]),
  ];
}

function recallSummary(hints, candidates) {
  return `${hints.length} recalled · ${candidates.length} ${candidates.length === 1 ? "candidate" : "candidates"}`;
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
