import { tokenize } from "../tokenize.mjs";

const DEFAULT_DIMENSIONS = 256;
const SEMANTIC_MIN_SCORE = 0.05;

export class LocalVectorIndex {
  constructor(chunks, vectors, { vectorizer = defaultVectorizer } = {}) {
    this.chunks = chunks;
    this.dimensions = vectorizer.dimensions;
    this.vectorizer = vectorizer;
    this.vectors = vectors;
  }

  static async create(chunks, { vectorizer = defaultVectorizer } = {}) {
    const vectors = await vectorizer.encode(chunks.map(chunkVectorText));
    return new LocalVectorIndex(chunks, vectors, { vectorizer });
  }

  async search(query, { limit = 50 } = {}) {
    const [queryVector] = await this.vectorizer.encode([query]);
    return this.searchVector(queryVector, { limit });
  }

  searchVector(queryVector, { limit = 50 } = {}) {
    if (queryVector.norm === 0) return [];
    const scored = [];
    for (let index = 0; index < this.vectors.length; index += 1) {
      const score = cosineSimilarity(queryVector, this.vectors[index]);
      if (score >= SEMANTIC_MIN_SCORE) scored.push({ chunk: this.chunks[index], score });
    }
    scored.sort((a, b) => b.score - a.score || a.chunk.file_path.localeCompare(b.chunk.file_path));
    return scored.slice(0, limit);
  }
}

export class HashingVectorizer {
  constructor({ dimensions = DEFAULT_DIMENSIONS } = {}) {
    this.id = `hashing-${dimensions}`;
    this.dimensions = dimensions;
  }

  async encode(texts) {
    return texts.map((text) => vectorizeText(text, this.dimensions));
  }
}

export const defaultVectorizer = new HashingVectorizer();

function chunkVectorText(chunk) {
  return [
    chunk.file_path,
    chunk.symbols.join(" "),
    chunk.identifiers.join(" "),
    chunk.content,
  ].join("\n");
}

function vectorizeText(text, dimensions) {
  const values = new Float32Array(dimensions);
  const tokens = tokenize(text);
  for (const token of tokens) {
    addFeature(values, token, 1);
    for (const gram of charTrigrams(token)) addFeature(values, gram, 0.35);
  }
  return normalizedVector(values);
}

export function normalizedVector(values) {
  return { values, norm: vectorNorm(values) };
}

function addFeature(values, feature, weight) {
  const hash = hashString(feature);
  const index = hash % values.length;
  const sign = hash & 1 ? 1 : -1;
  values[index] += sign * weight;
}

function charTrigrams(token) {
  const padded = `^${token}$`;
  if (padded.length <= 3) return [padded];
  const grams = [];
  for (let index = 0; index <= padded.length - 3; index += 1) grams.push(padded.slice(index, index + 3));
  return grams;
}

function cosineSimilarity(left, right) {
  if (left.norm === 0 || right.norm === 0) return 0;
  let dot = 0;
  for (let index = 0; index < left.values.length; index += 1) dot += left.values[index] * right.values[index];
  return dot / (left.norm * right.norm);
}

function vectorNorm(values) {
  let sum = 0;
  for (const value of values) sum += value * value;
  return Math.sqrt(sum);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
