import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Model2VecVectorizer } from "../../agent/code-search/retrieval/model2vec.mjs";
import { parseMemoryMarkdown } from "./markdown-format.mjs";

export const POTION_RETRIEVAL_MODEL_ID = "minishlab/potion-retrieval-32M";

const MAX_CHUNK_CHARS = 1800;
export const DEFAULT_MEMORY_RECALL_MIN_SCORE = 0.3;

export class SemanticMemoryRecallIndex {
  constructor({ stateRoot = null, modelId = POTION_RETRIEVAL_MODEL_ID, modelDir = null, vectorizer = null, minScore = parseMemoryRecallMinScore() } = {}) {
    this.modelId = modelId;
    this.minScore = minScore;
    this.vectorizer = vectorizer ?? createDefaultVectorizer({ stateRoot, modelId, modelDir });
    this.signature = "";
    this.chunks = [];
    this.vectors = [];
  }

  get enabled() {
    return Boolean(this.vectorizer);
  }

  async search(query, { entries, excluded = new Set(), limit = 3, candidateLimit = 5 } = {}) {
    const empty = { recalled: [], candidates: [], threshold: this.minScore };
    if (!this.vectorizer || !String(query ?? "").trim()) return empty;
    const activeEntries = [...entries.values()].filter((entry) => entry.status === "active" && entry.description && !excluded.has(entry.id));
    if (activeEntries.length === 0) return empty;
    await this.#ensureIndex(activeEntries);
    const [queryVector] = await this.vectorizer.encode([query]);
    if (!queryVector || queryVector.norm === 0) return empty;

    const bestByEntry = new Map();
    for (let index = 0; index < this.vectors.length; index += 1) {
      const chunk = this.chunks[index];
      if (excluded.has(chunk.entry.id)) continue;
      const score = cosineSimilarity(queryVector, this.vectors[index]);
      const prev = bestByEntry.get(chunk.entry.id);
      if (!prev || score > prev.score) bestByEntry.set(chunk.entry.id, { entry: chunk.entry, score });
    }

    const candidates = [...bestByEntry.values()]
      .filter(({ score }) => Number.isFinite(score) && score > 0)
      .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
      .map(({ entry, score }) => ({ entry, score, recalled: score >= this.minScore }));
    return {
      recalled: candidates.filter((candidate) => candidate.recalled).slice(0, limit),
      candidates: candidates.slice(0, Math.max(limit, candidateLimit)),
      threshold: this.minScore,
    };
  }

  async #ensureIndex(entries) {
    const signature = entries.map(entrySignature).join("\n");
    if (signature === this.signature) return;
    this.chunks = entries.flatMap(memoryChunks);
    this.vectors = this.chunks.length > 0
      ? await this.vectorizer.encode(this.chunks.map((chunk) => chunk.text))
      : [];
    this.signature = signature;
  }
}

export function parseMemoryRecallMinScore(value = process.env.MARCH_MEMORY_RECALL_MIN_SCORE) {
  if (value == null || value === "") return DEFAULT_MEMORY_RECALL_MIN_SCORE;
  const normalized = String(value).trim().toLowerCase();
  if (["false", "no", "off"].includes(normalized)) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MEMORY_RECALL_MIN_SCORE;
}

function createDefaultVectorizer({ stateRoot, modelId, modelDir }) {
  const dir = modelDir ?? (stateRoot ? join(stateRoot, "memory", "models", modelId.replaceAll("/", "__")) : null);
  if (!dir) return null;
  return new Model2VecVectorizer({ modelDir: dir, modelId });
}

function memoryChunks(entry) {
  const body = readMemoryBody(entry);
  const sections = splitMarkdownBody(body);
  const chunks = sections.length > 0 ? sections : [""];
  return chunks.map((section, index) => ({
    entry,
    index,
    text: [
      entry.name,
      entry.description,
      entry.tags.join(" "),
      section,
    ].filter(Boolean).join("\n"),
  }));
}

function readMemoryBody(entry) {
  try {
    return parseMemoryMarkdown(readFileSync(entry.path, "utf8")).body.trim();
  } catch {
    return "";
  }
}

function splitMarkdownBody(body) {
  const blocks = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const chunks = [];
  let current = "";
  for (const block of blocks) {
    if (!current) {
      current = block;
      continue;
    }
    if (current.length + block.length + 2 <= MAX_CHUNK_CHARS) {
      current = `${current}\n\n${block}`;
      continue;
    }
    chunks.push(current);
    current = block;
  }
  if (current) chunks.push(current);
  return chunks.flatMap(splitOversizedChunk);
}

function splitOversizedChunk(text) {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const chunks = [];
  for (let index = 0; index < text.length; index += MAX_CHUNK_CHARS) {
    chunks.push(text.slice(index, index + MAX_CHUNK_CHARS));
  }
  return chunks;
}

function entrySignature(entry) {
  return `${entry.id}:${entry.path}:${Math.trunc(entry.mtimeMs ?? 0)}:${entry.size ?? 0}`;
}

function cosineSimilarity(left, right) {
  if (!left?.norm || !right?.norm) return 0;
  let dot = 0;
  for (let index = 0; index < left.values.length; index += 1) dot += left.values[index] * right.values[index];
  return dot / (left.norm * right.norm);
}
