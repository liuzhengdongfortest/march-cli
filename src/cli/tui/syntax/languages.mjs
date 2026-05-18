export const LANGUAGES = {
  bash: { file: "tree-sitter-bash.wasm", query: "bash.highlights.scm" },
  c: { file: "tree-sitter-c.wasm", query: "c.highlights.scm" },
  cpp: { file: "tree-sitter-cpp.wasm", query: "cpp.highlights.scm" },
  csharp: { file: "tree-sitter-c-sharp.wasm", query: "csharp.highlights.scm" },
  css: { file: "tree-sitter-css.wasm", query: "css.highlights.scm" },
  diff: { file: "tree-sitter-diff.wasm", query: "diff.highlights.scm" },
  go: { file: "tree-sitter-go.wasm", query: "go.highlights.scm" },
  html: { file: "tree-sitter-html.wasm", query: "html.highlights.scm" },
  java: { file: "tree-sitter-java.wasm", query: "java.highlights.scm" },
  javascript: { file: "tree-sitter-typescript.wasm", query: "typescript.highlights.scm" },
  json: { file: "tree-sitter-json.wasm", query: "json.highlights.scm" },
  php: { file: "tree-sitter-php.wasm", query: "php.highlights.scm" },
  python: { file: "tree-sitter-python.wasm", query: "python.highlights.scm" },
  ruby: { file: "tree-sitter-ruby.wasm", query: "ruby.highlights.scm" },
  rust: { file: "tree-sitter-rust.wasm", query: "rust.highlights.scm" },
  toml: { file: "tree-sitter-toml.wasm", query: "toml.highlights.scm" },
  tsx: { file: "tree-sitter-tsx.wasm", query: "tsx.highlights.scm" },
  typescript: { file: "tree-sitter-typescript.wasm", query: "typescript.highlights.scm" },
  yaml: { file: "tree-sitter-yaml.wasm", query: "yaml.highlights.scm" },
};

export const LANG_ALIASES = new Map([
  ["bash", "bash"], ["c", "c"], ["cc", "cpp"], ["cjs", "javascript"], ["cpp", "cpp"],
  ["cs", "csharp"], ["css", "css"], ["cts", "typescript"], ["csharp", "csharp"], ["cxx", "cpp"],
  ["diff", "diff"], ["go", "go"], ["h", "c"], ["hh", "cpp"], ["htm", "html"], ["html", "html"],
  ["hpp", "cpp"], ["hxx", "cpp"], ["java", "java"], ["javascript", "javascript"], ["js", "javascript"],
  ["json", "json"], ["jsonc", "json"], ["jsx", "tsx"], ["mjs", "javascript"], ["mts", "typescript"],
  ["patch", "diff"], ["php", "php"], ["py", "python"], ["python", "python"], ["rb", "ruby"],
  ["rs", "rust"], ["ruby", "ruby"], ["rust", "rust"], ["sh", "bash"], ["toml", "toml"],
  ["ts", "typescript"], ["tsx", "tsx"], ["typescript", "typescript"], ["yaml", "yaml"], ["yml", "yaml"],
  ["zsh", "bash"],
]);

export const SCOPE_STYLE = {
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
  tag: "38;5;203",
  attribute: "38;5;179",
};

export const SCOPE_PRIORITY = {
  default: 0,
  punctuation: 1,
  operator: 2,
  variable: 3,
  property: 4,
  attribute: 4,
  type: 5,
  function: 6,
  keyword: 7,
  constant: 8,
  number: 9,
  string: 10,
  comment: 11,
  tag: 12,
};

export const KEYWORDS = new Set([
  "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
  "debugger", "declare", "default", "delete", "do", "else", "enum", "export", "extends", "finally",
  "for", "from", "function", "get", "if", "implements", "import", "in", "infer", "instanceof",
  "interface", "keyof", "let", "module", "namespace", "new", "of", "private", "protected", "public",
  "readonly", "return", "satisfies", "set", "static", "switch", "throw", "try", "type", "typeof",
  "var", "void", "while", "with", "yield",
]);

export const CONSTANTS = new Set(["false", "null", "super", "this", "true", "undefined"]);
export const OPERATORS = new Set([
  "+", "-", "*", "/", "%", "=", "==", "===", "!=", "!==", "<", "<=", ">", ">=", "=>",
  "&&", "||", "!", "?", "??", "|", "&", "^", "~", ":",
]);
export const PUNCTUATION = new Set(["(", ")", "[", "]", "{", "}", ".", ",", ";"]);
export const STRING_TYPES = new Set(["string", "string_fragment", "template_string", "regex", "escape_sequence"]);
export const NUMBER_TYPES = new Set(["number", "number_fragment"]);
export const TYPE_TYPES = new Set(["type_identifier", "predefined_type", "primitive_type", "type_annotation"]);
export const PROPERTY_TYPES = new Set([
  "property_identifier",
  "shorthand_property_identifier",
  "shorthand_property_identifier_pattern",
]);
