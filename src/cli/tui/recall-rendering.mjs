import { brightBlack } from "./ui-theme.mjs";

const RECALL_ICON = "◈";

export function formatPassiveRecallLines(hints = []) {
  if (!hints.length) return [];
  if (hints.length === 1) {
    const hint = hints[0];
    return [`${RECALL_ICON} passive recall: ${formatHint(hint)}`];
  }
  return [
    `${RECALL_ICON} passive recall: ${hints.length} memories`,
    ...hints.map((hint) => `  ${formatHint(hint)}`),
  ];
}

export function writePassiveRecall({ output, hints = [] }) {
  for (const line of formatPassiveRecallLines(hints)) {
    output.writeln(brightBlack(line));
  }
}

function formatHint(hint) {
  return [hint.id, hint.name].filter(Boolean).join(" ");
}
