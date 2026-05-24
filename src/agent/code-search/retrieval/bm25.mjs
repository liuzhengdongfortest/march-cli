import { tokenize } from "../tokenize.mjs";

const K1 = 1.2;
const B = 0.75;

export class Bm25Index {
  constructor(chunks) {
    this.chunks = chunks;
    this.documents = chunks.map((chunk) => buildDocument(chunk));
    this.averageLength = this.documents.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, this.documents.length);
    this.documentFrequency = new Map();
    for (const doc of this.documents) {
      for (const token of doc.uniqueTokens) this.documentFrequency.set(token, (this.documentFrequency.get(token) ?? 0) + 1);
    }
  }

  search(query, { limit = 50 } = {}) {
    const queryTokens = [...new Set(tokenize(query))];
    if (queryTokens.length === 0) return [];
    const scored = [];
    for (let index = 0; index < this.documents.length; index += 1) {
      const score = this.scoreDocument(this.documents[index], queryTokens);
      if (score > 0) scored.push({ chunk: this.chunks[index], score });
    }
    scored.sort((a, b) => b.score - a.score || a.chunk.file_path.localeCompare(b.chunk.file_path));
    return scored.slice(0, limit);
  }

  scoreDocument(doc, queryTokens) {
    let score = 0;
    for (const token of queryTokens) {
      const frequency = doc.termFrequency.get(token) ?? 0;
      if (frequency === 0) continue;
      const idf = Math.log(1 + (this.documents.length - (this.documentFrequency.get(token) ?? 0) + 0.5) / ((this.documentFrequency.get(token) ?? 0) + 0.5));
      const denominator = frequency + K1 * (1 - B + B * doc.length / Math.max(1, this.averageLength));
      score += idf * (frequency * (K1 + 1)) / denominator;
    }
    return score;
  }
}

function buildDocument(chunk) {
  const tokens = tokenize(`${chunk.file_path} ${chunk.symbols.join(" ")} ${chunk.content}`);
  const termFrequency = new Map();
  for (const token of tokens) termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
  return { termFrequency, uniqueTokens: new Set(tokens), length: Math.max(1, tokens.length) };
}
