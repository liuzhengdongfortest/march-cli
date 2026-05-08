import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export function createMemoryTools(graph, glossary, searchIndexer = null) {
  return [
    defineTool({
      name: "read_memory",
      label: "Read Memory",
      description: "Read a memory entry from the March memory graph by its path (e.g. 'core://notes/architecture'). Returns content and metadata.",
      parameters: Type.Object({
        path: Type.String({ description: "Memory path like 'notes/architecture' (core domain) or full URI" }),
        domain: Type.Optional(Type.String({ description: "Domain. Default: 'core'" })),
      }),
      execute: async (_toolCallId, params) => {
        let domain = params.domain ?? "core";
        let path = params.path;
        // Parse domain://path format
        const uriMatch = path.match(/^([a-z][a-z0-9+.-]*):\/\/(.+)/);
        if (uriMatch) {
          domain = uriMatch[1];
          path = uriMatch[2];
        }
        const memory = graph.getMemoryByPath(path, domain);
        if (!memory) {
          return toolText(`No memory found at ${domain}://${path}`);
        }
        return toolText(
          `--- ${domain}://${path} ---\n${memory.content}\n\npriority: ${memory.priority} | aliases: ${memory.alias_count} | deprecated: ${memory.deprecated}`,
          { memory },
        );
      },
    }),

    defineTool({
      name: "create_memory",
      label: "Create Memory",
      description: "Create a new memory entry under a parent path. Stores content in the graph with a URI path.",
      parameters: Type.Object({
        parent_path: Type.String({ description: "Parent path (empty string for root)" }),
        content: Type.String({ description: "Memory content to store" }),
        title: Type.Optional(Type.String({ description: "Path title. Auto-numbered if omitted." })),
        priority: Type.Optional(Type.Number({ description: "Priority (lower = more important). Default: 0" })),
        domain: Type.Optional(Type.String({ description: "Domain. Default: 'core'" })),
      }),
      execute: async (_toolCallId, params) => {
        const result = graph.createMemory(
          params.parent_path ?? "",
          params.content,
          params.priority ?? 0,
          { title: params.title ?? null, domain: params.domain ?? "core" },
        );
        return toolText(
          `Created ${result.uri}\nnode: ${result.node_uuid}\npriority: ${result.priority}`,
          { memory: result },
        );
      },
    }),

    defineTool({
      name: "update_memory",
      label: "Update Memory",
      description: "Update a memory's content or metadata. Content changes create a new version (old version preserved for rollback).",
      parameters: Type.Object({
        path: Type.String({ description: "Memory path to update" }),
        content: Type.Optional(Type.String({ description: "New content" })),
        priority: Type.Optional(Type.Number({ description: "New priority" })),
        disclosure: Type.Optional(Type.String({ description: "Disclosure hint for context injection" })),
        domain: Type.Optional(Type.String({ description: "Domain. Default: 'core'" })),
      }),
      execute: async (_toolCallId, params) => {
        const result = graph.updateMemory(params.path, {
          content: params.content ?? null,
          priority: params.priority ?? null,
          disclosure: params.disclosure ?? null,
          domain: params.domain ?? "core",
        });
        return toolText(
          `Updated ${result.uri}\nold_memory: ${result.old_memory_id} → new_memory: ${result.new_memory_id}`,
          { result },
        );
      },
    }),

    defineTool({
      name: "delete_memory",
      label: "Delete Memory",
      description: "Remove a memory path. Refuses if children would become unreachable (provide alternative paths first).",
      parameters: Type.Object({
        path: Type.String({ description: "Memory path to delete" }),
        domain: Type.Optional(Type.String({ description: "Domain. Default: 'core'" })),
      }),
      execute: async (_toolCallId, params) => {
        try {
          const result = graph.removePath(params.path, params.domain ?? "core");
          return toolText(`Deleted: ${result.deleted}`, { result });
        } catch (err) {
          return toolText(`Error: ${err.message}`, { error: true });
        }
      },
    }),

    defineTool({
      name: "add_alias",
      label: "Add Alias",
      description: "Create an alternative path (alias) pointing to the same memory. Useful for cross-referencing.",
      parameters: Type.Object({
        new_path: Type.String({ description: "New alias path" }),
        target_path: Type.String({ description: "Existing target path" }),
        domain: Type.Optional(Type.String({ description: "Domain for both paths. Default: 'core'" })),
      }),
      execute: async (_toolCallId, params) => {
        try {
          const domain = params.domain ?? "core";
          const result = graph.addPath(params.new_path, params.target_path, { newDomain: domain, targetDomain: domain });
          return toolText(`Alias created: ${result.new_uri} → ${result.target_uri}`, { result });
        } catch (err) {
          return toolText(`Error: ${err.message}`, { error: true });
        }
      },
    }),

    defineTool({
      name: "manage_triggers",
      label: "Manage Triggers",
      description: "Add or remove glossary keyword triggers. When a keyword appears in user messages, the linked memory is auto-disclosed in context.",
      parameters: Type.Object({
        action: Type.String({ description: "'add' or 'remove'" }),
        keyword: Type.Optional(Type.String({ description: "Keyword/phrase to trigger on. Required for 'add'." })),
        keyword_id: Type.Optional(Type.Number({ description: "Keyword ID to remove. Required for 'remove'." })),
        path: Type.Optional(Type.String({ description: "Memory path to link keyword to. Required for 'add'." })),
        domain: Type.Optional(Type.String({ description: "Domain. Default: 'core'" })),
      }),
      execute: async (_toolCallId, params) => {
        if (params.action === "add") {
          if (!params.keyword || !params.path) {
            return toolText("Error: keyword and path are required for 'add' action.", { error: true });
          }
          const domain = params.domain ?? "core";
          const memory = graph.getMemoryByPath(params.path, domain);
          if (!memory) {
            return toolText(`Error: path not found: ${domain}://${params.path}`, { error: true });
          }
          glossary.addKeyword(params.keyword, memory.node_uuid);
          return toolText(`Keyword '${params.keyword}' bound to ${domain}://${params.path}`);
        }

        if (params.action === "remove") {
          if (!params.keyword_id) {
            return toolText("Error: keyword_id is required for 'remove' action.", { error: true });
          }
          glossary.removeKeyword(params.keyword_id);
          return toolText(`Keyword ${params.keyword_id} removed.`);
        }

        return toolText("Error: action must be 'add' or 'remove'.", { error: true });
      },
    }),

    defineTool({
      name: "search_memory",
      label: "Search Memory",
      description: "Full-text search across all memory content. Returns ranked results with snippets.",
      parameters: Type.Object({
        query: Type.String({ description: "Search query" }),
        limit: Type.Optional(Type.Number({ description: "Max results. Default: 10" })),
      }),
      execute: async (_toolCallId, params) => {
        const limit = params.limit ?? 10;

        if (searchIndexer) {
          const results = searchIndexer.search(params.query, { limit });
          if (results.length === 0) {
            return toolText(`No memories matching "${params.query}".`);
          }
          const lines = results.map((r) => {
            const paths = graph.getPathsForNode(r.node_uuid);
            const uri = paths.length > 0
              ? `${paths[0].domain}://${paths[0].path}`
              : `node:${r.node_uuid}`;
            return `--- ${uri} (score: ${r.score?.toFixed(1) ?? "?"}) ---\n${r.snippet ?? r.content?.slice(0, 200)}`;
          });
          return toolText(`${results.length} results for "${params.query}":\n\n${lines.join("\n\n")}`, { results });
        }

        // Fallback: return recent memories
        const recent = graph.getRecentMemories(limit);
        if (recent.length === 0) {
          return toolText("No memories found. The memory graph is empty.");
        }
        const lines = recent.map((m) => `${m.uri} | priority: ${m.priority} | ${m.created_at}`);
        return toolText(`${recent.length} recent memories:\n\n${lines.join("\n")}`, { memories: recent });
      },
    }),
  ];
}

function toolText(text, details = {}) {
  return { content: [{ type: "text", text }], details };
}
