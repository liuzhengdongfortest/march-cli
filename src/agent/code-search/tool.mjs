import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../tool-result.mjs";
import { searchCode } from "./engine.mjs";

export function createCodeSearchTool({ engine }) {
  return defineTool({
    name: "code_search",
    label: "Code Search",
    description: "Native code-aware search over the workspace. Use it to locate relevant code snippets before reading full files; use grep for exact string confirmation.",
    parameters: Type.Object({
      query: Type.Optional(Type.String({ description: "Natural-language or symbol query" })),
      path: Type.Optional(Type.String({ description: "Relative or absolute workspace path to search; default current workspace" })),
      top_k: Type.Optional(Type.Number({ description: "Maximum results to return; default 5, max 20" })),
      mode: Type.Optional(Type.Union([
        Type.Literal("auto"),
        Type.Literal("symbol"),
        Type.Literal("lexical"),
        Type.Literal("semantic"),
      ], { description: "Search mode. auto uses BM25 + local vector retrieval with RRF fusion." })),
      include_tests: Type.Optional(Type.Boolean({ description: "Include test/spec paths without penalty; default false" })),
      related_to: Type.Optional(Type.Object({
        file_path: Type.String({ description: "Workspace-relative file path containing the known code" }),
        line: Type.Number({ description: "Line inside the known code chunk" }),
      }, { description: "Find code related to a known file location; query can optionally refine the relation" })),
    }),
    execute: async (_toolCallId, params) => executeCodeSearch({ engine, ...params }),
  });
}

export async function executeCodeSearch({ engine, query, path = ".", top_k, mode = "auto", include_tests = false, related_to }) {
  try {
    const root = engine.cwd;
    const searchPath = path === "." ? "." : engine.resolvePath(path);
    const result = await searchCode({ root, query, path: searchPath, top_k, mode, include_tests, related_to });
    return toolText(formatSearchOutput(result), result);
  } catch (err) {
    return toolText(`Error running code_search: ${err.message}`, { error: true });
  }
}

function formatSearchOutput({ results, stats }) {
  const header = `--- code_search (${results.length} results, ${stats.files} files, ${stats.chunks} chunks, ${stats.mode}) ---`;
  if (results.length === 0) return `${header}\nNo matching code snippets found.`;
  const body = results.map((result, index) => [
    `${index + 1}. ${result.file_path}:${result.start_line}-${result.end_line} score=${result.score} kind=${result.kind}${result.symbols.length ? ` symbols=${result.symbols.join(",")}` : ""}`,
    fenceSnippet(result.snippet),
  ].join("\n")).join("\n\n");
  return `${header}\n${body}`;
}

function fenceSnippet(snippet) {
  return "```\n" + snippet.trimEnd() + "\n```";
}
