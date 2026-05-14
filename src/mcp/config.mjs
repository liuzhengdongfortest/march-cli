import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

/**
 * Load MCP server configurations from .march/mcp.json (project) and
 * ~/.march/mcp.json (user). Project config takes precedence over user config
 * for servers with the same name.
 *
 * Config format (standard MCP):
 * {
 *   "mcpServers": {
 *     "server-name": {
 *       "command": "npx",          // stdio transport
 *       "args": ["-y", "server"],
 *       "env": { "KEY": "value" }, // optional
 *       "instructions": "..."       // optional prompt injection
 *     }
 *   }
 * }
 *
 * Remote servers use "url" instead of "command"/"args".
 */
export function loadMcpConfig(projectDir) {
  const servers = new Map();

  // User-level config (lower priority)
  const userPath = join(homedir(), ".march", "mcp.json");
  if (existsSync(userPath)) {
    try {
      const raw = JSON.parse(readFileSync(userPath, "utf-8"));
      for (const [name, cfg] of Object.entries(raw.mcpServers ?? {})) {
        servers.set(name, { ...cfg, _scope: "user" });
      }
    } catch (err) {
      console.error(`[mcp] Failed to parse ${userPath}: ${err.message}`);
    }
  }

  // Project-level config (higher priority — overrides user)
  const projectPath = join(projectDir, ".march", "mcp.json");
  if (existsSync(projectPath)) {
    try {
      const raw = JSON.parse(readFileSync(projectPath, "utf-8"));
      for (const [name, cfg] of Object.entries(raw.mcpServers ?? {})) {
        servers.set(name, { ...cfg, _scope: "project" });
      }
    } catch (err) {
      console.error(`[mcp] Failed to parse ${projectPath}: ${err.message}`);
    }
  }

  return servers;
}

/**
 * Walk up from startDir to find all .march/mcp.json files (hierarchical merge).
 * Closest to startDir wins. Stops at root or when git root boundary is hit.
 */
export function loadMcpConfigHierarchical(startDir) {
  const chain = [];
  let dir = startDir;
  const root = dirname(dir) === dir ? dir : null;

  while (dir && dir !== root) {
    const cfgPath = join(dir, ".march", "mcp.json");
    if (existsSync(cfgPath)) {
      try {
        chain.unshift(JSON.parse(readFileSync(cfgPath, "utf-8")));
      } catch (err) {
        console.error(`[mcp] Failed to parse ${cfgPath}: ${err.message}`);
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // User-level as base
  const userPath = join(homedir(), ".march", "mcp.json");
  if (existsSync(userPath)) {
    try {
      chain.unshift(JSON.parse(readFileSync(userPath, "utf-8")));
    } catch (err) {
      console.error(`[mcp] Failed to parse ${userPath}: ${err.message}`);
    }
  }

  // Merge: later entries override earlier
  const servers = new Map();
  for (const cfg of chain) {
    for (const [name, serverCfg] of Object.entries(cfg.mcpServers ?? {})) {
      servers.set(name, serverCfg);
    }
  }

  return servers;
}

/**
 * Determine transport type from server config.
 * Returns "stdio" if config has "command", "http" if it has "url".
 */
export function detectTransport(config) {
  if (config.command) return "stdio";
  if (config.url) return "http";
  return "stdio"; // default
}

/**
 * Build a display name for a server.
 */
export function serverDisplayName(name, config) {
  const source = config._scope ?? "unknown";
  return `${name} [${detectTransport(config)} · ${source}]`;
}

/**
 * Validate server config returns human-readable errors, or null if valid.
 */
export function validateMcpConfig(name, config) {
  const transport = detectTransport(config);
  if (transport === "stdio" && !config.command) {
    return `Server "${name}": stdio transport requires "command"`;
  }
  if (transport === "http" && !config.url) {
    return `Server "${name}": http transport requires "url"`;
  }
  return null;
}
