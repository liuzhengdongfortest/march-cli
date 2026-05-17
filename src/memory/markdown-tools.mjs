import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../agent/tool-result.mjs";

export function createMarkdownMemoryTools(store) {
  if (!store) return [];
  return [
    defineTool({
      name: "memory_search",
      label: "Memory Search",
      description:
        "Search the Markdown memory vault using ripgrep. This is literal text search over memory Markdown files, not semantic search and not March's internal tags-only memory hint recall. Use it when memory hints are insufficient or you need to find a memory by phrase, term, or detail.",
      parameters: Type.Object({
        query: Type.String({ description: "Ripgrep query to search in Markdown memory files" }),
        limit: Type.Optional(Type.Number({ description: "Maximum matching lines to return. Default: 20" })),
      }),
      execute: async (_toolCallId, params) => {
        const results = store.searchRipgrep(params.query, { limit: params.limit ?? 20 });
        if (results.length === 0) return toolText(formatMemorySearchMiss(params.query));
        return toolText(results.map((result) => result.line).join("\n"), { results });
      },
    }),

    defineTool({
      name: "memory_open",
      label: "Memory Open",
      description: "Open a Markdown memory by id or by path. Use this after memory hint or memory_search when you need the full memory body.",
      parameters: Type.Object({
        id: Type.Optional(Type.String({ description: "Memory id from memory hint, e.g. mem_..." })),
        path: Type.Optional(Type.String({ description: "Path returned by memory_search" })),
      }),
      execute: async (_toolCallId, params) => {
        try {
          const identifier = params.id || params.path;
          const opened = store.open(identifier);
          return toolText(`--- ${opened.path} ---\n${opened.content}`, opened);
        } catch (err) {
          return toolText(`Error: ${err.message}`, { error: true });
        }
      },
    }),

    defineTool({
      name: "memory_save",
      label: "Memory Save",
      description:
        "Create or update a Markdown memory. Before creating a new memory, merge related updates into an existing memory when they share the same topic or decision thread. New memories require name, description, body, and at least one tag because memory hints only use tags. When updating by id, omitted fields keep their existing values; passing tags replaces the full tag list.",
      parameters: Type.Object({
        id: Type.Optional(Type.String({ description: "Existing memory id to update. Omit to create a new memory." })),
        name: Type.Optional(Type.String({ description: "Memory name. Required when creating." })),
        description: Type.Optional(Type.String({ description: "Short natural-language summary shown in memory hint. Required when creating." })),
        body: Type.Optional(Type.String({ description: "Markdown memory body. Required when creating." })),
        tags: Type.Optional(Type.Array(Type.String(), { description: "Tags used for memory hint. Required and non-empty when creating; replaces tags when updating. Prefer stable retrieval keys: project name, technology, feature/domain, user/person, and decision topic. Use lowercase kebab-case when possible. Use shared tags to keep related facts discoverable and merge them into one memory when they belong to the same topic. Examples: ['march-cli', 'tooling', 'permissions'], ['memory', 'sqlite-index']." })),
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
      description: "Soft-delete a Markdown memory by id or path. This marks status as deleted so memory hint and memory_search exclude it; the file remains on disk for audit/recovery.",
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

function formatMemorySearchMiss(query) {
  const text = String(query ?? "");
  const lines = [
    `No memory files matched "${text}".`,
    "memory_search is literal ripgrep over Markdown files; it is not semantic search and does not use memory-hint hints.",
  ];
  if (/^mem_[a-z0-9_\-]+$/i.test(text.trim())) {
    lines.push("This looks like a memory id. Use memory_open({ id }) to open it directly.");
  }
  return lines.join("\n");
}
