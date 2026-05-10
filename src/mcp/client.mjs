import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { detectTransport } from "./config.mjs";

const DEFAULT_TIMEOUT = 30_000;

export class McpClientManager {
  constructor() {
    this._clients = new Map();       // name -> { client, transport, config, status, tools }
    this._abortController = new AbortController();
  }

  // ── Connection ─────────────────────────────────────────────────────

  async connect(name, config) {
    if (this._clients.has(name)) {
      await this.disconnect(name);
    }

    const transportType = detectTransport(config);
    const transport = transportType === "stdio"
      ? this._createStdioTransport(config)
      : await this._createHttpTransport(config);

    const client = new Client(
      { name: "march", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );

    try {
      await client.connect(transport, { timeout: config.timeout ?? DEFAULT_TIMEOUT });
    } catch (err) {
      transport.close?.();
      throw new Error(`Failed to connect to MCP server "${name}": ${err.message}`);
    }

    this._clients.set(name, {
      client,
      transport,
      config,
      status: "connected",
      tools: [],
    });

    return client;
  }

  async disconnect(name) {
    const entry = this._clients.get(name);
    if (!entry) return;
    try {
      await entry.client.close();
    } catch {
      // best-effort
    }
    try {
      entry.transport.close?.();
    } catch {
      // best-effort
    }
    this._clients.delete(name);
  }

  async disconnectAll() {
    const names = [...this._clients.keys()];
    await Promise.all(names.map((n) => this.disconnect(n)));
  }

  // ── Transport factories ────────────────────────────────────────────

  _createStdioTransport(config) {
    return new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: config.env ?? {},
    });
  }

  async _createHttpTransport(config) {
    // Try streamable HTTP first, SSE as fallback
    try {
      const transport = new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: config.headers ? { headers: config.headers } : undefined,
      });
      return transport;
    } catch {
      const transport = new SSEClientTransport(new URL(config.url), {
        requestInit: config.headers ? { headers: config.headers } : undefined,
      });
      return transport;
    }
  }

  // ── Tool discovery ─────────────────────────────────────────────────

  async discoverTools(name) {
    const entry = this._clients.get(name);
    if (!entry) throw new Error(`MCP server "${name}" not connected`);

    try {
      const result = await entry.client.listTools();
      entry.tools = result.tools ?? [];
      return entry.tools;
    } catch (err) {
      entry.status = "failed";
      throw new Error(`Failed to list tools from "${name}": ${err.message}`);
    }
  }

  getTools(name) {
    const entry = this._clients.get(name);
    return entry?.tools ?? [];
  }

  getAllTools() {
    const all = [];
    for (const [name, entry] of this._clients) {
      for (const tool of entry.tools) {
        all.push({ server: name, tool });
      }
    }
    return all;
  }

  // ── Tool call ──────────────────────────────────────────────────────

  async callTool(serverName, toolName, args, timeout) {
    const entry = this._clients.get(serverName);
    if (!entry) throw new Error(`MCP server "${serverName}" not connected`);

    try {
      const result = await entry.client.callTool(
        { name: toolName, arguments: args ?? {} },
        CallToolResultSchema,
        { resetTimeoutOnProgress: true, timeout: timeout ?? entry.config.timeout ?? DEFAULT_TIMEOUT },
      );

      // Flatten content into a readable text block
      return this._formatResult(result);
    } catch (err) {
      throw new Error(`MCP tool "${serverName}/${toolName}" failed: ${err.message}`);
    }
  }

  _formatResult(result) {
    const parts = [];
    for (const item of result.content ?? []) {
      if (item.type === "text") {
        parts.push(item.text);
      } else if (item.type === "image") {
        parts.push(`[image: ${item.mimeType ?? "unknown"} (${item.data?.length ?? 0} bytes)]`);
      } else if (item.type === "resource") {
        parts.push(`[resource: ${item.resource?.uri ?? item.resource?.text ?? "unknown"}]`);
      } else {
        parts.push(JSON.stringify(item));
      }
    }
    return {
      content: parts.join("\n"),
      details: { serverName, isError: result.isError },
    };
  }

  // ── Status ─────────────────────────────────────────────────────────

  getStatus(name) {
    const entry = this._clients.get(name);
    if (!entry) return { status: "disconnected" };
    return {
      status: entry.status,
      toolCount: entry.tools.length,
      transport: detectTransport(entry.config),
    };
  }

  getAllStatuses() {
    const result = {};
    for (const [name] of this._clients) {
      result[name] = this.getStatus(name);
    }
    return result;
  }

  isConnected(name) {
    const entry = this._clients.get(name);
    return entry?.status === "connected";
  }

  serverNames() {
    return [...this._clients.keys()];
  }
}
