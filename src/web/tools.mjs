import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../agent/tool-result.mjs";
import { searchWeb } from "./search.mjs";
import { fetchWebPage } from "./fetch.mjs";

export function createWebTools({ tavilyKey, braveKey } = {}) {
  const webSearchTool = defineTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web for current information on any topic. " +
      "Requires TAVILY_API_KEY or BRAVE_API_KEY; if neither is configured, use web_fetch when you already know the URL. " +
      "Use this for news, facts, or data beyond your knowledge cutoff. " +
      "Returns result titles, URLs, and snippets.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      maxResults: Type.Optional(
        Type.Number({ description: "Maximum number of results (default 5, max 10)" }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const { results, provider } = await searchWeb(params.query, {
          tavilyKey,
          braveKey,
          maxResults: Math.min(params.maxResults ?? 5, 10),
        });

        if (results.length === 0) {
          return toolText(`No results found for: ${params.query}`, { query: params.query });
        }

        const formatted = results
          .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
          .join("\n\n");

        return toolText(
          `Search results (${provider}):\n\n${formatted}`,
          { query: params.query, count: results.length, provider },
        );
      } catch (err) {
        return toolText(`Search failed: ${err.message}`, { error: true });
      }
    },
  });

  const webFetchTool = defineTool({
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Fetch and extract readable text content from a web page URL. " +
      "Useful for reading documentation, articles, or any web content. " +
      "Returns extracted text (max 50K chars). No API key required.",
    parameters: Type.Object({
      url: Type.String({ description: "Full URL of the page to fetch" }),
    }),
    execute: async (_toolCallId, params) => {
      if (!/^https?:\/\//i.test(params.url)) {
        return toolText("Error: URL must start with http:// or https://", { error: true });
      }

      try {
        const result = await fetchWebPage(params.url);
        const header = `--- ${result.url} (${result.length} chars${result.truncated ? ", truncated" : ""}) ---`;
        return toolText(
          `${header}\n\n${result.text}`,
          { url: result.url, length: result.length, truncated: result.truncated },
        );
      } catch (err) {
        return toolText(`Fetch failed: ${err.message}`, { error: true });
      }
    },
  });

  return [webSearchTool, webFetchTool];
}
