import { expandTags, normalizeText } from "./markdown-format.mjs";

export function formatRecallHints(source, hints = []) {
  if (!hints.length) return "";
  const lines = [`[recall source="${source}"]`];
  for (const hint of hints) {
    lines.push(`- ${hint.id}${formatScoreForPrompt(hint.score)} | ${hint.name} | ${hint.description}`);
  }
  return lines.join("\n");
}

export function scoreEntry(entry, terms, currentProject) {
  const expanded = expandTags(entry.tags);
  let score = 0;
  for (const term of terms) {
    if (entry.tags.map(normalizeText).includes(term)) score += 10;
    else if (expanded.includes(term)) score += 5;
  }
  if (currentProject) {
    const projectTag = normalizeText(`project/${currentProject}`);
    if (entry.tags.map(normalizeText).includes(projectTag)) score += 2;
  }
  return score;
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
