import { toHint } from "./markdown-recall.mjs";

export function lexicalRecall(text, { entries, excluded, minScore = 0.5 } = {}) {
  const query = normalizeRecallText(text);
  if (query.length < 4) return [];
  const grams = recallNgrams(query);
  if (grams.length === 0) return [];
  return [...entries.values()]
    .filter((entry) => entry.status === "active" && entry.description && !excluded.has(entry.id))
    .map((entry) => ({ entry, score: lexicalRecallScore(query, grams, entry) }))
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
}

export function mergeRecallRankings(primary = [], secondary = [], limit = 3) {
  const byId = new Map();
  for (const item of [...primary, ...secondary]) {
    const entry = item?.entry;
    if (!entry?.id) continue;
    const score = Number.isFinite(item.score) ? item.score : 0;
    const prev = byId.get(entry.id);
    if (!prev || score > prev.score) byId.set(entry.id, { entry, score });
  }
  return [...byId.values()]
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit);
}

export function toRecallCandidates(items, recalledIds) {
  return items.map(({ entry, score }) => ({ ...toHint(entry, { score }), recalled: recalledIds.has(entry.id) }));
}

function lexicalRecallScore(query, grams, entry) {
  const haystack = normalizeRecallText([entry.name, entry.description, ...(entry.tags ?? [])].join(" "));
  if (!haystack) return 0;
  if (haystack.includes(query)) return 0.95;
  let best = 0;
  for (const gram of grams) {
    if (haystack.includes(gram)) best = Math.max(best, gram.length / Math.max(query.length, 1));
  }
  return best >= 0.5 ? Math.min(0.9, 0.45 + best * 0.45) : 0;
}

function recallNgrams(text) {
  const grams = [];
  const max = Math.min(12, text.length);
  for (let size = max; size >= 4; size -= 1) {
    for (let index = 0; index <= text.length - size; index += 1) {
      const gram = text.slice(index, index + size);
      if (/\p{Script=Han}/u.test(gram)) grams.push(gram);
    }
  }
  return grams;
}

function normalizeRecallText(text) {
  return String(text ?? "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}
