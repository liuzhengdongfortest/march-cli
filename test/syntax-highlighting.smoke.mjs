import { strict as assert } from "node:assert";

export async function runSyntaxHighlightingSmoke() {
  console.log("--- smoke: tree-sitter syntax highlighting ---");
  const { highlightCodeLines, initializeTreeSitterHighlighting, isTreeSitterHighlightingReady, normalizeLanguage } = await import("../src/cli/tui/syntax/highlighting.mjs");

  await initializeTreeSitterHighlighting();
  assert.equal(isTreeSitterHighlightingReady(), true);
  assert.equal(normalizeLanguage("src/app.tsx"), "tsx");
  assert.equal(normalizeLanguage("main.py"), "python");
  assert.equal(normalizeLanguage("Dockerfile.unknown"), "");

  const samples = [
    ["py", "def hi(name):\n    return name", "def"],
    ["go", "func main() { return }", "func"],
    ["rs", "fn main() { let x = 1; }", "fn"],
    ["java", "class A { void f(){} }", "class"],
    ["cpp", "int main(){ return 0; }", "return"],
    ["cs", "class A { string Name { get; set; } }", "class"],
    ["sh", "echo hello", "echo"],
    ["yaml", "name: test", "name"],
    ["toml", "name = \"test\"", "name"],
    ["html", "<div class=\"x\">hi</div>", "div"],
    ["css", ".x { color: red; }", "color"],
    ["rb", "def hi; end", "def"],
    ["php", "<?php function hi() { return 1; }", "function"],
    ["json", "{\"a\": true}", "true"],
  ];

  for (const [lang, code, expected] of samples) {
    const rendered = highlightCodeLines(code, lang).join("\n");
    assert.ok(rendered.includes("\x1b["), `expected ANSI highlighting for ${lang}`);
    assert.ok(stripAnsi(rendered).includes(expected), `expected token for ${lang}`);
  }

  const fallback = highlightCodeLines("plain text", "unknown").join("\n");
  assert.ok(stripAnsi(fallback).includes("plain text"));
  console.log("  PASS");
}

function stripAnsi(text) {
  return String(text ?? "").replace(/\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
