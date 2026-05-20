import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../agent/tool-result.mjs";
import { createRemoteMemoryClients } from "./remote/client.mjs";
import { normalizeRemoteMemorySources } from "./remote/config.mjs";

export function createMarkdownMemoryTools(store, { remoteSources = [] } = {}) {
  if (!store) return [];
  const remoteClients = createRemoteMemoryClients(normalizeRemoteMemorySources({ remoteMemories: remoteSources }));
  return [
    defineTool({
      name: "memory_search",
      label: "Memory Search",
      description:
        "Search Markdown memory sources. By default searches local memory. Use source='all' for local plus all remote memories, source='local' for local memory, or source='<remote-name>' for a configured remote memory. Supports ripgrep regex syntax; use syntax='literal' for exact text search.",
      parameters: Type.Object({
        query: Type.String({ description: "Ripgrep query/pattern to search in Markdown memory files" }),
        source: Type.Optional(Type.String({ description: "Memory source: omitted/local, all, or a remote memory name" })),
        syntax: Type.Optional(Type.Union([Type.Literal("regex"), Type.Literal("literal")], { description: "Pattern syntax. Default: regex" })),
        case: Type.Optional(Type.Union([Type.Literal("smart"), Type.Literal("sensitive"), Type.Literal("insensitive")], { description: "Case matching mode. Default: smart" })),
        context: Type.Optional(Type.Number({ description: "Context lines around each match. Default: 2" })),
        glob: Type.Optional(Type.Array(Type.String(), { description: "Optional ripgrep glob filters, e.g. ['**/*.md']" })),
        limit: Type.Optional(Type.Number({ description: "Maximum matches to return. Default: 20, max: 50" })),
      }),
      execute: async (_toolCallId, params) => {
        try {
          const source = String(params.source ?? "local").trim() || "local";
          const results = await searchSources({ store, remoteClients, source, params });
          if (results.length === 0) return toolText(formatMemorySearchMiss(params.query, source));
          return toolText(formatMemorySearchResults(results, source), { results });
        } catch (err) {
          return toolText(`Error: ${err.message}`, { error: true });
        }
      },
    }),

    defineTool({
      name: "memory_open",
      label: "Memory Open",
      description: "Open a Markdown memory by id or by path. Use this after recall hint or memory_search when you need more context. Local memories may be edited with edit_file; remote memories are read-only.",
      parameters: Type.Object({
        id: Type.Optional(Type.String({ description: "Local memory id from recall hint, e.g. mem_..." })),
        source: Type.Optional(Type.String({ description: "Memory source: omitted/local or a remote memory name" })),
        path: Type.Optional(Type.String({ description: "Path returned by memory_search" })),
        line: Type.Optional(Type.Number({ description: "Open around this 1-based line number" })),
        context: Type.Optional(Type.Number({ description: "Context lines around line. Default: 40" })),
        offset: Type.Optional(Type.Number({ description: "Open from this 1-based line number" })),
        limit: Type.Optional(Type.Number({ description: "Maximum lines to return when using offset" })),
      }),
      execute: async (_toolCallId, params) => {
        try {
          const source = String(params.source ?? "local").trim() || "local";
          if (source !== "local") {
            const client = findRemoteClient(remoteClients, source);
            if (!client) throw new Error(`unknown remote memory source: ${source}`);
            if (!params.path) throw new Error("path is required for remote memory_open");
            const opened = await client.open(params);
            return toolText(formatRemoteOpen(opened), opened);
          }
          const identifier = params.id || params.path;
          const opened = store.open(identifier, params);
          return toolText(formatLocalOpen(opened), opened);
        } catch (err) {
          return toolText(`Error: ${err.message}`, { error: true });
        }
      },
    }),

    defineTool({
      name: "memory_save",
      label: "Memory Save",
      description:
        "Create a Markdown memory or update whole fields on an existing memory. For targeted edits to an existing memory body or frontmatter, use memory_open to get the path, then edit_file. Before creating a new memory, merge related updates into an existing memory when they share the same topic or decision thread. New memories require name, description, body, and at least one tag because recall hints only use tags. When updating by id, omitted fields keep their existing values; passing tags replaces the full tag list.",
      parameters: Type.Object({
        id: Type.Optional(Type.String({ description: "Existing memory id to update. Omit to create a new memory." })),
        name: Type.Optional(Type.String({ description: "Memory name. Required when creating." })),
        description: Type.Optional(Type.String({ description: "Short natural-language summary shown in recall hint. Required when creating." })),
        body: Type.Optional(Type.String({ description: "Markdown memory body. Required when creating." })),
        tags: Type.Optional(Type.Array(Type.String(), { description: "Tags used for recall hint. Required and non-empty when creating; replaces tags when updating. Prefer stable retrieval keys: project name, technology, feature/domain, user/person, and decision topic. Use lowercase kebab-case when possible. Examples: ['march-cli', 'tooling', 'permissions'], ['memory', 'sqlite-index']." })),
      }),
      execute: async (_toolCallId, params) => {
        try {
          const entry = store.save(params);
          return toolText(
            `Saved ${entry.id}\npath: ${entry.path}\ntags: ${entry.tags.join(", ")}`,
            { memory: entry },
          );
        } catch (err) {
          return toolText(`Error: ${err.message}`, { error: true });
        }
      },
    }),

    defineTool({
      name: "memory_delete",
      label: "Memory Delete",
      description: "Soft-delete a local Markdown memory by id or path. Remote memories are read-only and cannot be deleted through this tool.",
      parameters: Type.Object({
        id: Type.Optional(Type.String({ description: "Memory id to delete, e.g. mem_..." })),
        path: Type.Optional(Type.String({ description: "Memory file path to delete" })),
      }),
      execute: async (_toolCallId, params) => {
        try {
          const identifier = params.id || params.path;
          const result = store.delete(identifier);
          if (result.alreadyDeleted) return toolText(`Memory ${result.id} is already deleted.\npath: ${result.path}`, { memory: result });
          return toolText(`Deleted ${result.id}\npath: ${result.path}`, { memory: result });
        } catch (err) {
          return toolText(`Error: ${err.message}`, { error: true });
        }
      },
    }),
  ];
}

async function searchSources({ store, remoteClients, source, params }) {
  if (source === "local") return localSearch(store, params);
  if (source === "all") {
    const local = localSearch(store, params);
    const remote = await Promise.all(remoteClients.map(async (client) => client.search(params)));
    return [...local, ...remote.flat()].slice(0, normalizeLimit(params.limit));
  }
  const client = findRemoteClient(remoteClients, source);
  if (!client) throw new Error(`unknown remote memory source: ${source}`);
  return client.search(params);
}

function localSearch(store, params) {
  return store.searchRipgrep(params.query, params).map((result) => ({ ...result, source: "local" }));
}

function findRemoteClient(clients, source) {
  return clients.find((client) => client.name === source);
}

function formatMemorySearchResults(results, requestedSource) {
  const scope = requestedSource === "all" ? "all memory sources" : requestedSource;
  const lines = [`memory_search found ${results.length} match${results.length === 1 ? "" : "es"} in ${scope}.`];
  results.forEach((result, index) => {
    lines.push("", `[${index + 1}] ${result.source}: ${result.path}:${result.line}`);
    if (result.excerpt?.text) lines.push(result.excerpt.text);
    lines.push(`Open: memory_open source="${result.source}" path="${result.path}" line=${result.line}`);
  });
  return lines.join("\n");
}

function formatLocalOpen(opened) {
  const range = opened.startLine && opened.endLine ? `lines: ${opened.startLine}-${opened.endLine}\n` : "";
  return `path: ${opened.path}\n${range}Use edit_file with this path for targeted edits.\n\n---\n${opened.content}`;
}

function formatRemoteOpen(opened) {
  const range = opened.startLine && opened.endLine ? `lines: ${opened.startLine}-${opened.endLine}\n` : "";
  return `source: ${opened.source}\npath: ${opened.path}\n${range}Remote memory is read-only.\n\n---\n${opened.content}`;
}

function formatMemorySearchMiss(query, source) {
  const text = String(query ?? "");
  const where = source && source !== "local" ? ` in ${source}` : "";
  const lines = [
    `No memory files matched "${text}"${where}.`,
    "memory_search is literal ripgrep over Markdown files; it is not semantic search and does not use memory-hint hints.",
  ];
  if (/^mem_[a-z0-9_\-]+$/i.test(text.trim())) {
    lines.push("This looks like a memory id. Use memory_open({ id }) to open it directly.");
  }
  return lines.join("\n");
}

function normalizeLimit(limit) {
  const number = Number(limit);
  if (!Number.isFinite(number)) return 20;
  return Math.min(50, Math.max(1, Math.floor(number)));
}
