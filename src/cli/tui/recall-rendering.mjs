import { brightBlack } from "./ui-theme.mjs";

const RECALL_ICON = "◈";

export function formatMemoryHintLines(hints = []) {
  if (!hints.length) return [];
  if (hints.length === 1) {
    const hint = hints[0];
    return [`${RECALL_ICON} memory hint: ${formatHint(hint)}`];
  }
  return [
    `${RECALL_ICON} memory hint: ${hints.length} memories`,
    ...hints.map((hint) => `  ${formatHint(hint)}`),
  ];
}

export function writeMemoryHint({ output, hints = [] }) {
  for (const line of formatMemoryHintLines(hints)) {
    output.writeln(brightBlack(line));
  }
}

function formatHint(hint) {
  return [hint.id, hint.name].filter(Boolean).join(" ");
}
