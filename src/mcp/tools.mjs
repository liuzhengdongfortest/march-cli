import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

/**
 * Build a tool name from server + tool: mcp__{server}__{tool}
 */
export function buildMcpToolName(server, tool) {
  return `mcp__${sanitize(server)}__${sanitize(tool)}`;
}

/**
 * Parse an MCP tool name back into { server, tool }.
 */
export function parseMcpToolName(name) {
  const match = name.match(/^mcp__([^_]+(?:_[^_]+)*?)__([^_]+(?:_.+)?)$/);
  if (!match) return null;
  return { server: match[1], tool: match[2] };
}

function sanitize(s) {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/__+/g, "_");
}

/**
 * Map JSON Schema type to TypeBox type.
 * Handles the common MCP parameter schemas.
 */
function schemaToTypeBox(schema) {
  if (!schema || !schema.properties) return Type.Object({});

  const props = {};
  const required = new Set(schema.required ?? []);

  for (const [key, prop] of Object.entries(schema.properties)) {
    let box;
    switch (prop.type) {
      case "string":
        box = Type.String();
        break;
      case "number":
      case "integer":
        box = Type.Number();
        break;
      case "boolean":
        box = Type.Boolean();
        break;
      case "array":
        box = Type.Array(
          prop.items ? schemaToTypeBox(prop.items) : Type.Any(),
        );
        break;
      case "object":
        box = schemaToTypeBox(prop);
        break;
      default:
        box = Type.Any();
    }
    if (prop.description) box = box({ description: prop.description });
    if (!required.has(key)) box = Type.Optional(box);
    props[key] = box;
  }

  return Type.Object(props);
}

/**
 * Convert an MCP tool definition to a March-compatible tool.
 */
export function convertMcpTool(serverName, mcpTool, clientManager) {
  const fullName = buildMcpToolName(serverName, mcpTool.name);
  const description = mcpTool.description ?? `MCP tool: ${serverName}/${mcpTool.name}`;

  return defineTool({
    name: fullName,
    label: `MCP:${serverName}/${mcpTool.name}`,
    description: `[MCP ${serverName}] ${description}`,
    parameters: schemaToTypeBox(mcpTool.inputSchema),
    execute: async (_toolCallId, params) => {
      const result = await clientManager.callTool(serverName, mcpTool.name, params);
      return {
        content: [{ type: "text", text: result.content }],
        details: result.details,
      };
    },
  });
}

/**
 * Batch-convert all tools from all connected servers.
 */
export function convertAllMcpTools(clientManager) {
  const tools = [];
  const allTools = clientManager.getAllTools();
  for (const { server, tool } of allTools) {
    tools.push(convertMcpTool(server, tool, clientManager));
  }
  return tools;
}
