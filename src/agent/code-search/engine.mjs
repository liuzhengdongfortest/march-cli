import { chunkFile } from "./chunker.mjs";
import { Bm25Index } from "./bm25.mjs";
import { rerankResults } from "./rerank.mjs";
import { scanCodeFiles } from "./scanner.mjs";

const DEFAULT_TOP_K = 5;
const RETRIEVAL_LIMIT = 80;

export async function searchCode({ root, query, path = ".", top_k = DEFAULT_TOP_K, mode = "auto", include_tests = false } = {}) {
  const normalizedQuery = String(query ?? "").trim();
  if (!normalizedQuery) return { results: [], stats: { files: 0, chunks: 0 } };
  if (mode === "semantic") throw new Error("Native semantic code search is not enabled yet; use auto, lexical, or symbol.");

  const files = await scanCodeFiles({ root, path });
  const chunks = [];
  for (const file of files) chunks.push(...await chunkFile(file));
  const index = new Bm25Index(chunks);
  const lexicalResults = index.search(normalizedQuery, { limit: RETRIEVAL_LIMIT });
  const ranked = rerankResults(lexicalResults, normalizedQuery, { includeTests: include_tests });
  const limit = clampTopK(top_k);
  return {
    results: ranked.slice(0, limit).map(formatResult),
    stats: { files: files.length, chunks: chunks.length, mode: mode === "symbol" ? "symbol" : "lexical" },
  };
}

function formatResult({ chunk, score }) {
  return {
    file_path: chunk.file_path,
    start_line: chunk.start_line,
    end_line: chunk.end_line,
    language: chunk.language,
    kind: chunk.kind,
    symbols: chunk.symbols,
    score: Number(score.toFixed(3)),
    snippet: trimSnippet(chunk.content),
  };
}

function trimSnippet(content) {
  const lines = String(content ?? "").split("\n");
  const selected = lines.slice(0, 40);
  const suffix = lines.length > selected.length ? "\n…" : "";
  return selected.join("\n") + suffix;
}

function clampTopK(value) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_TOP_K;
  return Math.min(parsed, 20);
}
