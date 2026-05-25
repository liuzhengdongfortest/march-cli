export function formatRecallHints(hints = []) {
  if (!hints.length) return "";
  const lines = ["[recall]"];
  for (const hint of hints) {
    lines.push(`- ${hint.id}${formatScoreForPrompt(hint.score)} | ${hint.name} | ${hint.description}`);
  }
  return lines.join("\n");
}

export function toHint(entry, metadata = {}) {
  return { id: entry.id, name: entry.name, description: entry.description, ...metadata };
}

function formatScoreForPrompt(score) {
  return Number.isFinite(score) ? ` | score=${formatScore(score)}` : "";
}

export function formatScore(score) {
  return Number.isFinite(score) ? score.toFixed(2) : "--";
}
