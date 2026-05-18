import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Language, Parser, Query } from "web-tree-sitter";
import { R } from "../ui-theme.mjs";
import {
  CONSTANTS,
  KEYWORDS,
  LANG_ALIASES,
  LANGUAGES,
  NUMBER_TYPES,
  OPERATORS,
  PROPERTY_TYPES,
  PUNCTUATION,
  SCOPE_PRIORITY,
  SCOPE_STYLE,
  STRING_TYPES,
  TYPE_TYPES,
} from "./languages.mjs";

const RESOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), "tree-sitter");

let initPromise;
let initialized = false;
const parsers = new Map();
const queries = new Map();
const highlightCache = new Map();

export function initializeTreeSitterHighlighting() {
  if (initPromise) return initPromise;
  initPromise = initializeParsers();
  return initPromise;
}

export function isTreeSitterHighlightingReady() {
  return initialized;
}

export function normalizeLanguage(langOrPath = "") {
  const raw = String(langOrPath ?? "").trim().toLowerCase();
  if (!raw) return "";
  const direct = LANG_ALIASES.get(raw);
  if (direct) return direct;
  const ext = raw.match(/\.([a-z0-9]+)$/)?.[1];
  return ext ? (LANG_ALIASES.get(ext) ?? "") : "";
}

export function highlightCodeLines(code, langOrPath = "", options = {}) {
  const text = String(code ?? "");
  const lang = normalizeLanguage(langOrPath);
  const key = `${lang}\0${options.bg ?? ""}\0${text}`;
  const cached = highlightCache.get(key);
  if (cached) return cached;

  const runs = treeSitterRuns(text, lang) ?? fallbackRuns(text, lang);
  const rendered = renderRunsByLine(text, runs, options);
  if (highlightCache.size > 200) highlightCache.clear();
  highlightCache.set(key, rendered);
  return rendered;
}

export function highlightCodeLine(line, langOrPath = "", options = {}) {
  return highlightCodeLines(String(line ?? ""), langOrPath, options)[0] ?? "";
}

async function initializeParsers() {
  try {
    await Parser.init();
    for (const [lang, config] of Object.entries(LANGUAGES)) {
      const language = await Language.load(join(RESOURCE_DIR, config.file));
      const parser = new Parser();
      parser.setLanguage(language);
      parsers.set(lang, parser);
      const query = loadHighlightQuery(language, config.query);
      if (query) queries.set(lang, query);
    }
    initialized = true;
    highlightCache.clear();
  } catch {
    initialized = false;
  }
}

function treeSitterRuns(text, lang) {
  const parser = parsers.get(lang);
  if (!initialized || !parser || !text) return null;
  try {
    const tree = parser.parse(text);
    const scopes = Array.from({ length: text.length }, () => ({ scope: "default", priority: 0 }));
    const query = queries.get(lang);
    if (query) applyQueryScopes(query, tree.rootNode, scopes);
    collectNodeScopes(tree.rootNode, scopes);
    return scopesToRuns(text, scopes);
  } catch {
    return null;
  }
}

function loadHighlightQuery(language, queryFile) {
  if (!queryFile) return null;
  const path = join(RESOURCE_DIR, queryFile);
  if (!existsSync(path)) return null;
  try {
    return new Query(language, readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function applyQueryScopes(query, rootNode, scopes) {
  for (const capture of query.captures(rootNode)) {
    const scope = captureScope(capture.name);
    if (!scope) continue;
    applyScope(scopes, capture.node.startIndex, capture.node.endIndex, scope);
  }
}

function captureScope(name) {
  const value = String(name ?? "").toLowerCase();
  if (!value) return null;
  if (value.includes("comment")) return "comment";
  if (value.includes("string") || value.includes("escape") || value.includes("regex")) return "string";
  if (value.includes("number") || value.includes("float") || value.includes("boolean") || value.includes("constant")) return "constant";
  if (value.includes("keyword") || value.includes("conditional") || value.includes("repeat") || value.includes("include")) return "keyword";
  if (value.includes("function") || value.includes("method") || value.includes("constructor")) return "function";
  if (value.includes("type") || value.includes("class") || value.includes("namespace") || value.includes("module")) return "type";
  if (value.includes("property") || value.includes("field")) return "property";
  if (value.includes("attribute") || value.includes("annotation")) return "attribute";
  if (value.includes("operator")) return "operator";
  if (value.includes("punctuation") || value.includes("delimiter") || value.includes("bracket")) return "punctuation";
  if (value.includes("tag")) return "tag";
  if (value.includes("variable") || value.includes("parameter")) return "variable";
  return null;
}

function collectNodeScopes(node, scopes) {
  const scope = classifyNode(node);
  if (scope) applyScope(scopes, node.startIndex, node.endIndex, scope);
  for (const child of node.children ?? []) collectNodeScopes(child, scopes);
}

function classifyNode(node) {
  const type = node.type;
  if (type === "comment") return "comment";
  if (STRING_TYPES.has(type)) return "string";
  if (type === "raw_string_literal" || type === "interpreted_string_literal" || type === "char_literal") return "string";
  if (NUMBER_TYPES.has(type)) return "number";
  if (type === "integer_literal" || type === "float_literal" || type === "decimal_integer_literal") return "number";
  if (TYPE_TYPES.has(type)) return "type";
  if (type === "type_identifier" || type === "scoped_type_identifier") return "type";
  if (PROPERTY_TYPES.has(type)) return "property";
  if (type === "field_identifier" || type === "property_name") return "property";
  if (type === "tag_name") return "tag";
  if (type === "attribute_name") return "attribute";
  if (type === "regex_pattern") return "string";
  if (type === "identifier") return classifyIdentifier(node);
  if (type === "jsx_identifier") return "type";
  if (type === "null" || type === "true" || type === "false") return "constant";
  if (!node.isNamed) {
    if (KEYWORDS.has(type)) return "keyword";
    if (CONSTANTS.has(type)) return "constant";
    if (OPERATORS.has(type)) return "operator";
    if (PUNCTUATION.has(type)) return "punctuation";
  }
  return null;
}

function classifyIdentifier(node) {
  const text = node.text;
  if (KEYWORDS.has(text)) return "keyword";
  if (CONSTANTS.has(text)) return "constant";

  const parent = node.parent;
  const field = childFieldName(parent, node);
  if (field === "name" && /function|method|declaration/.test(parent?.type ?? "")) return "function";
  if (field === "name" && /class|interface|type_alias|enum/.test(parent?.type ?? "")) return "type";
  if (field === "function" && parent?.type === "call_expression") return "function";
  if (field === "property") return "property";
  if (parent?.type === "member_expression" || parent?.type === "subscript_expression") return "property";
  if (/type|heritage|implements/.test(parent?.type ?? "")) return "type";
  return "variable";
}

function childFieldName(parent, child) {
  if (!parent) return "";
  const children = parent.children ?? [];
  for (let i = 0; i < children.length; i++) {
    if (children[i].equals?.(child)) return parent.fieldNameForChild(i) ?? "";
  }
  return "";
}

function applyScope(scopes, start, end, scope) {
  const priority = SCOPE_PRIORITY[scope] ?? 0;
  for (let i = Math.max(0, start); i < Math.min(scopes.length, end); i++) {
    if (priority >= scopes[i].priority) scopes[i] = { scope, priority };
  }
}

function scopesToRuns(text, scopes) {
  const runs = [];
  for (let i = 0; i < text.length;) {
    const scope = scopes[i]?.scope ?? "default";
    let end = i + 1;
    while (end < text.length && (scopes[end]?.scope ?? "default") === scope) end++;
    runs.push({ text: text.slice(i, end), scope });
    i = end;
  }
  return runs;
}

function fallbackRuns(text, lang) {
  const pattern = fallbackPattern(lang);
  if (!pattern) return [{ text, scope: "default" }];
  const runs = [];
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > index) runs.push({ text: text.slice(index, match.index), scope: "default" });
    runs.push({ text: match[0], scope: fallbackScope(match[0]) });
    index = match.index + match[0].length;
  }
  if (index < text.length) runs.push({ text: text.slice(index), scope: "default" });
  return runs;
}

function fallbackPattern(lang) {
  if (["javascript", "typescript", "jsx", "tsx"].includes(lang)) {
    return /\/\/.*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`|\b(?:async|await|break|case|catch|class|const|continue|default|else|export|for|from|function|if|import|interface|let|new|null|return|throw|try|type|undefined|while)\b|\b\d+(?:\.\d+)?\b/g;
  }
  if (lang === "json") return /"(?:\\.|[^"])*"|\b(?:true|false|null)\b|\b\d+(?:\.\d+)?\b/g;
  return /#.*|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\b(?:cd|cp|echo|exit|git|grep|ls|mkdir|mv|npm|node|pnpm|rm|yarn)\b|\b\d+(?:\.\d+)?\b/g;
}

function fallbackScope(token) {
  if (token.startsWith("//") || token.startsWith("#") || token.startsWith("/*")) return "comment";
  if (/^["'`]/.test(token)) return "string";
  if (/^\d/.test(token)) return "number";
  if (CONSTANTS.has(token)) return "constant";
  return "keyword";
}

function renderRunsByLine(source, runs, options) {
  const lines = [""];
  for (const run of runs.length ? runs : [{ text: source, scope: "default" }]) {
    const parts = run.text.split("\n");
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push("");
      if (parts[i]) lines[lines.length - 1] += styleSyntax(parts[i], run.scope, options.bg);
    }
  }
  return lines;
}

export function styleSyntax(text, scope = "default", bg = "") {
  const codes = [SCOPE_STYLE[scope] ?? SCOPE_STYLE.default];
  if (bg) codes.push(bg);
  return `\x1b[${codes.join(";")}m${text}${R}`;
}

void initializeTreeSitterHighlighting();
