import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../agent/tool-result.mjs";

export function createHistorySearchTool({ store } = {}) {
  if (!store) return null;
  return defineTool({
    name: "history_search",
    label: "History Search",
    description: "Search archived March turn history with ripgrep. Use it when you need details from previous sessions or earlier turns. History stores user/assistant text, visible thinking, tool call metadata, memory recall hints, and failed tool error excerpts; successful tool results are not stored.",
    parameters: Type.Object({
      query: Type.String({ description: "Ripgrep query/pattern to search in archived turn history" }),
      allProjects: Type.Optional(Type.Boolean({ description: "Search all project histories instead of the current cwd history. Default false." })),
      sessionId: Type.Optional(Type.String({ description: "Limit search to a specific session id when known" })),
      syntax: Type.Optional(Type.Union([Type.Literal("regex"), Type.Literal("literal")], { description: "Pattern syntax. Default: regex" })),
      case: Type.Optional(Type.Union([Type.Literal("smart"), Type.Literal("sensitive"), Type.Literal("insensitive")], { description: "Case matching mode. Default: smart" })),
      context: Type.Optional(Type.Number({ description: "Context lines around each match. Default: 2" })),
      limit: Type.Optional(Type.Number({ description: "Maximum matches to return. Default: 20, max: 50" })),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const results = store.searchRipgrep(params.query, params);
        if (results.length === 0) return toolText(`history_search found no matches for ${JSON.stringify(params.query)}.`);
        return toolText(formatHistorySearchResults(results), { results });
      } catch (err) {
        return toolText(`Error: ${err.message}`, { error: true });
      }
    },
  });
}

function formatHistorySearchResults(results) {
  const lines = [`history_search found ${results.length} match${results.length === 1 ? "" : "es"}.`];
  results.forEach((result, index) => {
    lines.push("", `[${index + 1}] ${result.path}:${result.line}`);
    if (result.excerpt?.text) lines.push(result.excerpt.text);
  });
  return lines.join("\n");
}
