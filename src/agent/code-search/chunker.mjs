import { getParser } from "./parser-pool.mjs";
import { uniqueTokens } from "./tokenize.mjs";

const MAX_CHUNK_LINES = 80;
const FALLBACK_WINDOW = 60;
const CHUNK_NODE_TYPES = new Set([
  "function_declaration", "method_definition", "class_declaration", "lexical_declaration", "interface_declaration",
  "type_alias_declaration", "export_statement", "function_definition", "class_definition", "method_declaration",
  "function_item", "impl_item", "struct_item", "enum_item", "function_declaration", "method_declaration",
]);

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
    if (!isChunkNode(node)) return;
    const start = node.startPosition.row + 1;
    const end = Math.min(node.endPosition.row + 1, start + MAX_CHUNK_LINES - 1);
    if (end < start) return;
    const content = lines.slice(start - 1, end).join("\n");
    if (!content.trim()) return;
    chunks.push(toChunk(file, content, start, end, classifyKind(node), extractSymbols(node)));
  });
  return dedupeContainedChunks(chunks);
}

function walk(node, visit) {
  visit(node);
  for (const child of node.namedChildren ?? node.children ?? []) walk(child, visit);
}

function isChunkNode(node) {
  if (!node?.isNamed) return false;
  if (CHUNK_NODE_TYPES.has(node.type)) return true;
  return /function|method|class|interface|struct|enum|type_alias/.test(node.type);
}

function classifyKind(node) {
  const type = node.type;
  if (/class|interface|struct|enum|type_alias/.test(type)) return "class";
  if (/function|method/.test(type)) return "function";
  return "block";
}

function extractSymbols(node) {
  const symbols = [];
  for (const child of node.namedChildren ?? []) {
    const field = childFieldName(node, child);
    if (field === "name" && child.text) symbols.push(child.text);
  }
  return symbols.slice(0, 5);
}

function childFieldName(parent, child) {
  const children = parent.children ?? [];
  for (let index = 0; index < children.length; index += 1) {
    if (children[index].equals?.(child)) return parent.fieldNameForChild(index) ?? "";
  }
  return "";
}

function dedupeContainedChunks(chunks) {
  const sorted = chunks.sort((a, b) => a.start_line - b.start_line || a.end_line - b.end_line);
  return sorted.filter((chunk, index) => !sorted.some((other, otherIndex) => (
    otherIndex !== index && other.file_path === chunk.file_path && other.start_line <= chunk.start_line && other.end_line >= chunk.end_line && span(other) < span(chunk) + 10
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
