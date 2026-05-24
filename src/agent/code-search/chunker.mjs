import { chunkRuleFor, extractNodeSymbols } from "./chunk-rules.mjs";
import { getParser } from "./parser-pool.mjs";
import { uniqueTokens } from "./tokenize.mjs";

const MAX_CHUNK_LINES = 80;
const FALLBACK_WINDOW = 60;


export async function chunkFile(file) {
  const lines = file.content.split("\n");
  const parser = await getParser(file.language);
  if (!parser) return fallbackChunks(file, lines);
  try {
    const tree = parser.parse(file.content);
    const chunks = collectAstChunks(file, lines, tree.rootNode);
    const completed = addUncoveredLineChunks(file, lines, chunks);
    return completed.length > 0 ? completed : fallbackChunks(file, lines);
  } catch {
    return fallbackChunks(file, lines);
  }
}

function collectAstChunks(file, lines, rootNode) {
  const chunks = [];
  walk(rootNode, (node) => {
    const rule = chunkRuleFor(file.language, node);
    if (!rule) return;
    const start = node.startPosition.row + 1;
    const end = Math.min(node.endPosition.row + 1, start + MAX_CHUNK_LINES - 1);
    if (end < start) return;
    const content = lines.slice(start - 1, end).join("\n");
    if (!content.trim()) return;
    chunks.push(toChunk(file, content, start, end, rule.kind, extractNodeSymbols(file.language, node)));
  });
  return dedupeContainedChunks(chunks);
}

function walk(node, visit) {
  visit(node);
  for (const child of node.namedChildren ?? node.children ?? []) walk(child, visit);
}


function dedupeContainedChunks(chunks) {
  const sorted = chunks.sort((a, b) => a.start_line - b.start_line || a.end_line - b.end_line);
  return sorted.filter((chunk, index) => !sorted.some((other, otherIndex) => (
    otherIndex !== index
      && other.file_path === chunk.file_path
      && other.start_line <= chunk.start_line
      && other.end_line >= chunk.end_line
      && span(other) < span(chunk) + 10
  )));
}

function span(chunk) {
  return chunk.end_line - chunk.start_line;
}

function addUncoveredLineChunks(file, lines, chunks) {
  const covered = new Set();
  for (const chunk of chunks) {
    for (let line = chunk.start_line; line <= chunk.end_line; line += 1) covered.add(line);
  }
  const completed = [...chunks];
  let start = null;
  for (let line = 1; line <= lines.length; line += 1) {
    if (!covered.has(line) && lines[line - 1]?.trim()) {
      start ??= line;
    } else if (start !== null) {
      completed.push(...fallbackRangeChunks(file, lines, start, line - 1));
      start = null;
    }
  }
  if (start !== null) completed.push(...fallbackRangeChunks(file, lines, start, lines.length));
  return completed.sort((a, b) => a.start_line - b.start_line || a.end_line - b.end_line);
}

function fallbackRangeChunks(file, lines, start, end) {
  const chunks = [];
  for (let line = start; line <= end; line += FALLBACK_WINDOW) {
    const chunkEnd = Math.min(end, line + FALLBACK_WINDOW - 1);
    const content = lines.slice(line - 1, chunkEnd).join("\n");
    if (content.trim()) chunks.push(toChunk(file, content, line, chunkEnd, docsOrConfigKind(file), []));
  }
  return chunks;
}

function fallbackChunks(file, lines) {
  const kind = docsOrConfigKind(file);
  const chunks = [];
  for (let start = 1; start <= lines.length; start += FALLBACK_WINDOW) {
    const end = Math.min(lines.length, start + FALLBACK_WINDOW - 1);
    const content = lines.slice(start - 1, end).join("\n");
    if (content.trim()) chunks.push(toChunk(file, content, start, end, kind, []));
  }
  return chunks;
}

function docsOrConfigKind(file) {
  if (/\.(md|mdx|txt)$/i.test(file.relPath)) return "docs";
  if (/\.(json|jsonc|ya?ml|toml)$/i.test(file.relPath)) return "config";
  return "block";
}

function toChunk(file, content, start, end, kind, symbols) {
  return {
    id: `${file.relPath}:${start}-${end}`,
    file_path: file.relPath,
    abs_path: file.absPath,
    start_line: start,
    end_line: end,
    language: file.language,
    kind: refineKind(kind, content),
    symbols,
    identifiers: uniqueTokens(`${symbols.join(" ")} ${content}`).slice(0, 40),
    content,
  };
}

function refineKind(kind, content) {
  if (kind !== "block") return kind;
  if (/\b(class|interface|struct|enum|type)\b/.test(content)) return "class";
  if (/\b(function|def|fn)\b|=>/.test(content)) return "function";
  return kind;
}
