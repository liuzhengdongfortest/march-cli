import { tokenize } from "../tokenize.mjs";

const DEFAULT_DIMENSIONS = 256;
const SEMANTIC_MIN_SCORE = 0.05;

export class LocalVectorIndex {
  constructor(chunks, { dimensions = DEFAULT_DIMENSIONS } = {}) {
    this.chunks = chunks;
    this.dimensions = dimensions;
    this.vectors = chunks.map((chunk) => vectorizeText(chunkVectorText(chunk), dimensions));
  }

  search(query, { limit = 50 } = {}) {
    const queryVector = vectorizeText(query, this.dimensions);
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
