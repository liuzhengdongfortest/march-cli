import { defaultCodeSearchIndexCache } from "./cache.mjs";
import { rrfFuse } from "./retrieval/fusion.mjs";
import { rerankResults } from "./rerank.mjs";
import { scanCodeFiles } from "./scanner.mjs";

const DEFAULT_TOP_K = 5;
const RETRIEVAL_LIMIT = 80;

export async function searchCode(options = {}) {
  const {
    root,
    query,
    path = ".",
    top_k = DEFAULT_TOP_K,
    mode = "auto",
    include_tests = false,
    related_to,
    cache = defaultCodeSearchIndexCache,
  } = options;
  const normalizedQuery = String(query ?? "").trim();
  const activeCache = cache ?? defaultCodeSearchIndexCache;
  if (!normalizedQuery && !related_to) return { results: [], stats: { files: 0, chunks: 0 } };

  const files = await scanCodeFiles({ root, path });
  const built = await activeCache.build(files);
  const related = related_to ? relatedQuery(built.chunks, related_to, normalizedQuery) : null;
  const queryText = related?.query ?? normalizedQuery;
  const retrieved = await retrieveChunks(built.index, queryText, mode);
  const filtered = related ? retrieved.filter((result) => result.chunk.id !== related.targetId) : retrieved;
  const ranked = rerankResults(filtered, queryText, { includeTests: include_tests });
  const limit = clampTopK(top_k);
  return {
    results: ranked.slice(0, limit).map(formatResult),
    stats: formatStats(files, built, resultMode({ related_to, mode })),
  };
}

async function retrieveChunks(index, queryText, mode) {
  const lexical = index.lexical.search(queryText, { limit: RETRIEVAL_LIMIT });
  if (mode === "lexical" || mode === "symbol") return lexical;
  const semantic = await index.vector.search(queryText, { limit: RETRIEVAL_LIMIT });
  if (mode === "semantic") return semantic;
  return rrfFuse([
    { results: lexical, weight: 1.2 },
    { results: semantic, weight: 1 },
  ], { limit: RETRIEVAL_LIMIT });
}

function resultMode({ related_to, mode }) {
  if (related_to) return "related";
  if (mode === "symbol") return "symbol";
  if (mode === "semantic") return "semantic";
  if (mode === "lexical") return "lexical";
  return "hybrid";
}

function relatedQuery(chunks, relatedTo, query) {
  const target = findRelatedTarget(chunks, relatedTo);
  if (!target) throw new Error(`No indexed chunk found at ${relatedTo.file_path}:${relatedTo.line}`);
  return {
    targetId: target.id,
    query: [query, target.symbols.join(" "), target.identifiers.join(" "), target.content].filter(Boolean).join("\n"),
  };
}

function findRelatedTarget(chunks, relatedTo) {
  const filePath = String(relatedTo?.file_path ?? "").replace(/\\/g, "/");
  const line = Math.trunc(Number(relatedTo?.line));
  if (!filePath || !Number.isFinite(line)) throw new Error("related_to requires file_path and line");
  return chunks.find((chunk) => chunk.file_path === filePath && chunk.start_line <= line && chunk.end_line >= line);
}

function formatStats(files, built, mode) {
  return {
    files: files.length,
    chunks: built.chunks.length,
    mode,
    reused_files: built.reusedFiles,
    indexed_files: built.indexedFiles,
    reused_index: built.reusedIndex,
    vectorizer: built.vectorizer,
    vectorizer_status: built.vectorizer_status,
    vectorizer_warning: built.vectorizer_warning,
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
