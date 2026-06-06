import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Model2VecVectorizer } from "../../agent/code-search/retrieval/model2vec.mjs";
import { ResilientVectorizer } from "../../agent/code-search/retrieval/resilient-vectorizer.mjs";
import { parseMemoryMarkdown } from "./markdown-format.mjs";

export const POTION_RETRIEVAL_MODEL_ID = "minishlab/potion-retrieval-32M";

const MAX_CHUNK_CHARS = 1800;
const BODY_CHUNK_WEIGHTS = [0.65, 0.25, 0.1];
export const DEFAULT_MEMORY_RECALL_MIN_SCORE = 0.5;

export class SemanticMemoryRecallIndex {
  constructor({ stateRoot = null, modelId = POTION_RETRIEVAL_MODEL_ID, modelDir = null, vectorizer = null, minScore = parseMemoryRecallMinScore() } = {}) {
    this.modelId = modelId;
    this.minScore = minScore;
    this.vectorizer = vectorizer ?? createDefaultVectorizer({ stateRoot, modelId, modelDir });
    this.signature = "";
    this.bodyChunks = [];
    this.bodyVectors = [];
    this.metadataDocs = [];
    this.metadataVectors = [];
  }

  get enabled() {
    return Boolean(this.vectorizer);
  }

  get warning() {
    return this.vectorizer?.warning ?? null;
  }

  get status() {
    return this.vectorizer?.status ?? "primary";
  }

  async preload(options = {}) {
    if (!this.vectorizer) return false;
    if (typeof this.vectorizer.load === "function") await this.vectorizer.load(options);
    else await this.vectorizer.encode(["memory recall warmup"]);
    return true;
  }

  async search(query, { entries, excluded = new Set(), limit = 3, candidateLimit = 5 } = {}) {
    const empty = { recalled: [], candidates: [], threshold: this.minScore };
    if (!this.vectorizer || !String(query ?? "").trim()) return empty;
    const activeEntries = [...entries.values()].filter((entry) => entry.status === "active" && entry.description && !excluded.has(entry.id));
    if (activeEntries.length === 0) return empty;
    await this.#ensureIndex(activeEntries);
    const [queryVector] = await this.vectorizer.encode([query]);
    if (!queryVector || queryVector.norm === 0) return empty;

    const byEntry = new Map();
    for (let index = 0; index < this.metadataVectors.length; index += 1) {
      const doc = this.metadataDocs[index];
      if (excluded.has(doc.entry.id)) continue;
      const metadataScore = cosineSimilarity(queryVector, this.metadataVectors[index]);
      if (metadataScore > 0) byEntry.set(doc.entry.id, { entry: doc.entry, metadataScore, bodyChunkScores: [] });
    }
    for (let index = 0; index < this.bodyVectors.length; index += 1) {
      const chunk = this.bodyChunks[index];
      if (excluded.has(chunk.entry.id)) continue;
      const chunkScore = cosineSimilarity(queryVector, this.bodyVectors[index]);
      if (chunkScore <= 0) continue;
      const prev = byEntry.get(chunk.entry.id) ?? { entry: chunk.entry, metadataScore: 0, bodyChunkScores: [] };
      prev.bodyChunkScores.push(chunkScore);
      byEntry.set(chunk.entry.id, prev);
    }

    const ranked = [...byEntry.values()]
      .map((item) => {
        const topChunkScores = item.bodyChunkScores.sort((a, b) => b - a).slice(0, BODY_CHUNK_WEIGHTS.length);
        const bodyScore = weightedTopChunkScore(topChunkScores);
        const score = Math.max(bodyScore, item.metadataScore);
        return { entry: item.entry, score, bodyScore, metadataScore: item.metadataScore, topChunkScores };
      })
      .filter(({ score }) => Number.isFinite(score) && score > 0)
      .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
    const recalled = ranked.filter(({ score }) => score >= this.minScore).slice(0, limit);
    const recalledIds = new Set(recalled.map(({ entry }) => entry.id));
    const candidates = ranked
      .slice(0, Math.max(limit, candidateLimit))
      .map((item) => ({ ...item, recalled: recalledIds.has(item.entry.id) }));
    return {
      recalled,
      candidates,
      threshold: this.minScore,
      vectorizerStatus: this.status,
      warning: this.warning,
    };
  }

  async #ensureIndex(entries) {
    const signature = entries.map(entrySignature).join("\n");
    if (signature === this.signature) return;
    this.bodyChunks = entries.flatMap(memoryBodyChunks);
    this.metadataDocs = entries.map(memoryMetadataDoc).filter((doc) => doc.text);
    this.bodyVectors = this.bodyChunks.length > 0
      ? await this.vectorizer.encode(this.bodyChunks.map((chunk) => chunk.text))
      : [];
    this.metadataVectors = this.metadataDocs.length > 0
      ? await this.vectorizer.encode(this.metadataDocs.map((doc) => doc.text))
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
  return new ResilientVectorizer({
    primary: new Model2VecVectorizer({ modelDir: dir, modelId }),
    label: "memory recall",
  });
}

function memoryBodyChunks(entry) {
  return splitMarkdownBody(readMemoryBody(entry)).map((section, index) => ({ entry, index, text: section }));
}

function memoryMetadataDoc(entry) {
  return {
    entry,
    text: [entry.name, entry.description, entry.tags.join(" ")].filter(Boolean).join("\n"),
  };
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

function weightedTopChunkScore(scores) {
  if (scores.length === 0) return 0;
  const weights = BODY_CHUNK_WEIGHTS.slice(0, scores.length);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  return scores.reduce((sum, score, index) => sum + score * weights[index], 0) / weightTotal;
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
