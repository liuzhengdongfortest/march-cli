import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Language, Parser } from "web-tree-sitter";
import { R } from "../ui-theme.mjs";

const RESOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), "tree-sitter");
const ENCODER = new TextEncoder();

const LANGUAGES = {
  javascript: { file: "tree-sitter-typescript.wasm" },
  typescript: { file: "tree-sitter-typescript.wasm" },
  jsx: { file: "tree-sitter-tsx.wasm" },
  tsx: { file: "tree-sitter-tsx.wasm" },
  json: { file: "tree-sitter-json.wasm" },
};

const LANG_ALIASES = new Map([
  ["js", "javascript"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["javascript", "javascript"],
  ["ts", "typescript"],
  ["mts", "typescript"],
  ["cts", "typescript"],
  ["typescript", "typescript"],
  ["jsx", "jsx"],
  ["tsx", "tsx"],
  ["json", "json"],
  ["jsonc", "json"],
]);

const SCOPE_STYLE = {
  default: "38;2;127;216;143",
  comment: "2;90",
  string: "38;2;127;216;143",
  number: "36",
  constant: "36",
  keyword: "38;2;245;167;66",
  function: "38;5;117",
  type: "38;5;141",
  property: "38;5;116",
  operator: "38;5;250",
  punctuation: "38;5;245",
  variable: "38;5;250",
};

const SCOPE_PRIORITY = {
  default: 0,
  punctuation: 1,
  operator: 2,
  variable: 3,
  property: 4,
  type: 5,
  function: 6,
  keyword: 7,
  constant: 8,
  number: 9,
  string: 10,
  comment: 11,
};

const KEYWORDS = new Set([
  "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
  "debugger", "declare", "default", "delete", "do", "else", "enum", "export", "extends", "finally",
  "for", "from", "function", "get", "if", "implements", "import", "in", "infer", "instanceof",
  "interface", "keyof", "let", "module", "namespace", "new", "of", "private", "protected", "public",
  "readonly", "return", "satisfies", "set", "static", "switch", "throw", "try", "type", "typeof",
  "var", "void", "while", "with", "yield",
]);

const CONSTANTS = new Set(["false", "null", "super", "this", "true", "undefined"]);
const OPERATORS = new Set([
  "+", "-", "*", "/", "%", "=", "==", "===", "!=", "!==", "<", "<=", ">", ">=", "=>",
  "&&", "||", "!", "?", "??", "|", "&", "^", "~", ":",
]);
const PUNCTUATION = new Set(["(", ")", "[", "]", "{", "}", ".", ",", ";"]);
const STRING_TYPES = new Set(["string", "string_fragment", "template_string", "regex", "escape_sequence"]);
const NUMBER_TYPES = new Set(["number", "number_fragment"]);
const TYPE_TYPES = new Set(["type_identifier", "predefined_type", "primitive_type", "type_annotation"]);
const PROPERTY_TYPES = new Set([
  "property_identifier",
  "shorthand_property_identifier",
  "shorthand_property_identifier_pattern",
]);

let initPromise;
let initialized = false;
const parsers = new Map();
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
    const byteToIndex = buildByteToIndex(text);
    const scopes = Array.from({ length: text.length }, () => ({ scope: "default", priority: 0 }));
    collectScopes(tree.rootNode, byteToIndex, scopes);
    return scopesToRuns(text, scopes);
  } catch {
    return null;
  }
}

function collectScopes(node, byteToIndex, scopes) {
  const scope = classifyNode(node);
  if (scope) applyScope(scopes, byteToIndex[node.startIndex] ?? 0, byteToIndex[node.endIndex] ?? scopes.length, scope);
  for (const child of node.children ?? []) collectScopes(child, byteToIndex, scopes);
}

function classifyNode(node) {
  const type = node.type;
  if (type === "comment") return "comment";
  if (STRING_TYPES.has(type)) return "string";
  if (NUMBER_TYPES.has(type)) return "number";
  if (TYPE_TYPES.has(type)) return "type";
  if (PROPERTY_TYPES.has(type)) return "property";
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

function buildByteToIndex(text) {
  const map = [];
  let byte = 0;
  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index);
    const char = String.fromCodePoint(codePoint);
    const bytes = ENCODER.encode(char).length;
    for (let i = 0; i < bytes; i++) map[byte + i] = index;
    byte += bytes;
    index += char.length;
  }
  map[byte] = text.length;
  return map;
}

void initializeTreeSitterHighlighting();
