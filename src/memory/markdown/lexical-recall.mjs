import { readFileSync } from "node:fs";
import { toHint } from "./markdown-recall.mjs";
import { parseMemoryMarkdown } from "./markdown-format.mjs";

const DENSE_WEIGHT = 0.7;
const BM25_WEIGHT = 0.3;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

export function bm25Recall(text, { entries, excluded, minScore = 0.5 } = {}) {
  return hybridRecall([], text, { entries, excluded, minScore, limit: Number.POSITIVE_INFINITY });
}

export function hybridRecall(dense = [], text, { entries, excluded, minScore = 0.5, limit = 3 } = {}) {
  const sparse = bm25Scores(text, { entries, excluded });
  const byId = new Map();
  for (const item of dense) {
    const entry = item?.entry;
    if (!entry?.id) continue;
    const denseScore = boundedScore(item.score);
    byId.set(entry.id, { ...item, entry, denseScore, bm25Score: 0 });
  }
  for (const item of sparse) {
    const entry = item?.entry;
    if (!entry?.id) continue;
    const prev = byId.get(entry.id) ?? { entry, denseScore: 0 };
    byId.set(entry.id, { ...prev, entry, bm25Score: boundedScore(item.score) });
  }

  return [...byId.values()]
    .map((item) => ({
      ...item,
      score: hybridScore(item),
    }))
    .filter(({ score }) => Number.isFinite(score) && score >= minScore)
    .sort(rankRecallItems)
    .slice(0, limit);
}

export function mergeRecallRankings(primary = [], secondary = [], limit = 3) {
  const byId = new Map();
  for (const item of [...primary, ...secondary]) {
    const entry = item?.entry;
    if (!entry?.id) continue;
    const score = Number.isFinite(item.score) ? item.score : 0;
    const prev = byId.get(entry.id);
    if (!prev || score > prev.score) byId.set(entry.id, { ...item, entry, score });
  }
  return [...byId.values()].sort(rankRecallItems).slice(0, limit);
}

export function toRecallCandidates(items, recalledIds) {
  return items.map(({ entry, score }) => ({ ...toHint(entry, { score }), recalled: recalledIds.has(entry.id) }));
}

function bm25Scores(text, { entries, excluded } = {}) {
  const queryTerms = tokenize(text);
  if (queryTerms.length === 0) return [];
  const docs = [...entries.values()]
    .filter((entry) => entry.status === "active" && entry.description && !excluded.has(entry.id))
    .map((entry) => ({ entry, terms: memoryTerms(entry) }))
    .filter((doc) => doc.terms.length > 0);
  if (docs.length === 0) return [];

  const documentFrequency = new Map();
  for (const doc of docs) {
    for (const term of new Set(doc.terms)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
  const averageLength = docs.reduce((sum, doc) => sum + doc.terms.length, 0) / docs.length;
  const raw = docs
    .map((doc) => ({ entry: doc.entry, ...bm25DocumentScore(queryTerms, doc.terms, documentFrequency, docs.length, averageLength) }))
    .filter(({ score, matchedTerms }) => score > 0 && matchedTerms >= requiredSparseTermMatches(queryTerms))
    .sort(rankRecallItems);
  const maxScore = raw[0]?.score ?? 0;
  if (maxScore <= 0) return [];
  return raw.map((item) => ({ entry: item.entry, score: item.score / maxScore }));
}

function bm25DocumentScore(queryTerms, terms, documentFrequency, documentCount, averageLength) {
  const frequencies = new Map();
  for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  const lengthNorm = 1 - BM25_B + BM25_B * (terms.length / Math.max(averageLength, 1));
  let score = 0;
  let matchedTerms = 0;
  for (const term of new Set(queryTerms)) {
    const frequency = frequencies.get(term) ?? 0;
    if (frequency === 0) continue;
    matchedTerms += 1;
    const frequencyWeight = (frequency * (BM25_K1 + 1)) / (frequency + BM25_K1 * lengthNorm);
    const idf = Math.log(1 + (documentCount - (documentFrequency.get(term) ?? 0) + 0.5) / ((documentFrequency.get(term) ?? 0) + 0.5));
    score += idf * frequencyWeight;
  }
  return { score, matchedTerms };
}

function requiredSparseTermMatches(queryTerms) {
  const uniqueCount = new Set(queryTerms).size;
  return uniqueCount <= 1 ? 1 : 2;
}

function memoryTerms(entry) {
  const metadata = [entry.name, entry.description, ...(entry.tags ?? [])].filter(Boolean).join(" ");
  const body = readMemoryBody(entry);
  return [
    ...tokenize(metadata),
    ...tokenize(metadata),
    ...tokenize(body),
  ];
}

function readMemoryBody(entry) {
  try {
    return parseMemoryMarkdown(readFileSync(entry.path, "utf8")).body;
  } catch {
    return "";
  }
}

function tokenize(text) {
  const normalized = String(text ?? "").toLowerCase();
  const wordTerms = normalized.match(/[\p{L}\p{N}_-]{2,}/gu) ?? [];
  const han = normalized.replace(/[^\p{Script=Han}]/gu, "");
  const hanTerms = [];
  for (let size = Math.min(6, han.length); size >= 2; size -= 1) {
    for (let index = 0; index <= han.length - size; index += 1) hanTerms.push(han.slice(index, index + size));
  }
  return [...wordTerms, ...hanTerms];
}

function hybridScore(item) {
  const denseScore = item.denseScore ?? 0;
  const bm25Score = item.bm25Score ?? 0;
  const denseWeight = denseScore > 0 ? DENSE_WEIGHT : 0;
  const bm25Weight = bm25Score > 0 ? BM25_WEIGHT : 0;
  const totalWeight = denseWeight + bm25Weight;
  if (totalWeight <= 0) return 0;
  return (denseScore * denseWeight + bm25Score * bm25Weight) / totalWeight;
}

function boundedScore(score) {
  return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
}

function rankRecallItems(a, b) {
  return b.score - a.score || a.entry.name.localeCompare(b.entry.name);
}
