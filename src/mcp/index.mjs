export { loadMcpConfig, loadMcpConfigHierarchical, detectTransport, validateMcpConfig, serverDisplayName } from "./config.mjs";
export { McpClientManager } from "./client.mjs";
export { buildMcpToolName, parseMcpToolName, convertMcpTool, convertAllMcpTools } from "./tools.mjs";

/**
 * Initialize MCP: load config, connect to servers, discover tools.
 * Returns { clientManager, mcpTools, mcpInjections, errors }.
 */
export async function initializeMcp({ projectDir }) {
  const { loadMcpConfig } = await import("./config.mjs");
  const { McpClientManager } = await import("./client.mjs");
  const { convertAllMcpTools } = await import("./tools.mjs");

  const servers = loadMcpConfig(projectDir);
  if (servers.size === 0) {
    return { clientManager: null, mcpTools: [], mcpInjections: [], errors: [] };
  }

  const clientManager = new McpClientManager();
  const errors = [];
  const mcpInjections = [];

  for (const [name, config] of servers) {
    if (config.enabled === false) continue;
    try {
      await clientManager.connect(name, config);
      await clientManager.discoverTools(name);
      const injection = buildMcpInstructionsInjection(name, config);
      if (injection) mcpInjections.push(injection);
    } catch (err) {
      errors.push({ server: name, error: err.message });
    }
  }

  const mcpTools = convertAllMcpTools(clientManager);
  return { clientManager, mcpTools, mcpInjections, errors };
}

export function buildMcpInstructionsInjection(serverName, config) {
  if (typeof config?.instructions !== "string") return null;
  const content = config.instructions.trim();
  if (!content) return null;
  return {
    type: "mcp_server",
    source: serverName,
    content,
  };
}
