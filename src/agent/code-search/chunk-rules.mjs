const FUNCTION_TYPES = new Set([
  "function_declaration",
  "function_definition",
  "function_item",
  "method_definition",
  "method_declaration",
]);
const CLASS_TYPES = new Set([
  "class_declaration",
  "class_definition",
  "enum_declaration",
  "enum_item",
  "interface_declaration",
  "struct_item",
  "type_alias_declaration",
]);

const LANGUAGE_RULES = {
  javascript: jsTsRules(),
  typescript: jsTsRules(),
  tsx: jsTsRules(),
  python: rules({
    function: ["function_definition"],
    class: ["class_definition"],
  }),
  rust: rules({
    function: ["function_item"],
    class: ["enum_item", "impl_item", "struct_item", "trait_item", "type_item"],
  }),
  go: rules({
    function: ["function_declaration", "method_declaration"],
    class: ["type_declaration"],
  }),
  java: rules({
    function: ["constructor_declaration", "method_declaration"],
    class: ["class_declaration", "enum_declaration", "interface_declaration", "record_declaration"],
  }),
};

export function chunkRuleFor(language, node) {
  const rule = LANGUAGE_RULES[language]?.get(node.type);
  if (rule) return rule;
  if (FUNCTION_TYPES.has(node.type) || /function|method/.test(node.type)) return { kind: "function" };
  if (CLASS_TYPES.has(node.type) || /class|interface|struct|enum|type_alias/.test(node.type)) return { kind: "class" };
  return null;
}

export function extractNodeSymbols(language, node) {
  const byField = extractFieldSymbols(node);
  if (byField.length > 0) return byField.slice(0, 5);
  return extractSymbolsFromText(language, node.text).slice(0, 5);
}

function jsTsRules() {
  return rules({
    function: ["function_declaration", "generator_function_declaration", "method_definition"],
    class: ["abstract_class_declaration", "class_declaration", "interface_declaration", "type_alias_declaration"],
    block: ["lexical_declaration"],
  });
}

function rules(groups) {
  const map = new Map();
  for (const [kind, nodeTypes] of Object.entries(groups)) {
    for (const type of nodeTypes) map.set(type, { kind });
  }
  return map;
}

function extractFieldSymbols(node) {
  const symbols = [];
  const children = node.children ?? [];
  for (let index = 0; index < children.length; index += 1) {
    const field = node.fieldNameForChild(index) ?? "";
    if (field === "name" && children[index].text && isIdentifier(children[index].text)) {
      symbols.push(children[index].text);
    }
  }
  return symbols;
}

function isIdentifier(text) {
  return /^[A-Za-z_$][\w$]*$/.test(text);
}

function extractSymbolsFromText(language, text) {
  const source = String(text ?? "");
  const patterns = symbolPatterns(language);
  const symbols = [];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) symbols.push(match[1]);
  }
  return [...new Set(symbols)];
}

function symbolPatterns(language) {
  if (language === "python") return [/^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)/m, /^\s*class\s+([A-Za-z_][\w]*)/m];
  if (language === "rust") return [/^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)/m, /^\s*(?:pub\s+)?(?:struct|enum|trait|impl)\s+([A-Za-z_][\w]*)/m];
  if (language === "go") return [/^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/m, /^\s*type\s+([A-Za-z_][\w]*)/m];
  if (language === "java") return [/\b(?:class|interface|enum|record)\s+([A-Za-z_][\w]*)/m, /\b([A-Za-z_][\w]*)\s*\([^)]*\)\s*\{/m];
  return [
    /\b(?:function|class|interface|type)\s+([A-Za-z_$][\w$]*)/m,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/m,
    /\b([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?\([^)]*\)\s*=>/m,
  ];
}
