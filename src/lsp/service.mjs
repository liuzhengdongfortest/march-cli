import { LspClient } from "./client.mjs";
import { LspDiagnosticStore } from "./diagnostic-store.mjs";
import { resolveLspServerStatus } from "./servers.mjs";

export class LspService {
  constructor({ cwd, onEvent = null }) {
    this.cwd = cwd;
    this.onEvent = onEvent;
    this.store = new LspDiagnosticStore();
    this.clients = new Map();
    this.spawning = new Map();
    this.unavailable = new Map();
    this.announced = new Set();
  }

  async touchFile(path) {
    const result = await resolveLspServerStatus({ filePath: path, workspaceRoot: this.cwd, onEvent: (event) => this.onEvent?.(event) });
    if (result.status === "unsupported") return result;
    if (result.status === "unavailable") {
      this.unavailable.set(result.id, result);
      this.#emitOnce(`unavailable:${result.id}:${result.reason}`, result);
      return result;
    }

    const server = result.server;
    const key = `${server.id}:${server.root}`;
    const existing = this.clients.get(key);
    if (existing) {
      existing.touchFile(path);
      return { status: "already_attached", id: server.id, root: server.root };
    }
    if (this.spawning.has(key)) {
      this.spawning.get(key).then((client) => client?.touchFile(path)).catch(() => {});
      return { status: "starting", id: server.id, root: server.root };
    }

    this.#emitOnce(`starting:${key}`, { status: "starting", id: server.id, root: server.root, managed: server.managed });
    const task = this.#startClient(server, key).then((client) => {
      client?.touchFile(path);
      return client;
    });
    this.spawning.set(key, task);
    task.finally(() => {
      if (this.spawning.get(key) === task) this.spawning.delete(key);
    }).catch(() => {});
    return { status: "starting", id: server.id, root: server.root };
  }

  snapshot() {
    const storeSnapshot = this.store.snapshot();
    const servers = [
      ...[...this.clients.values()].map((client) => ({
        id: client.serverId,
        root: client.cwd,
        status: client.status,
      })),
      ...[...this.spawning.keys()].map((key) => ({
        id: key.slice(0, key.indexOf(":")),
        root: key.slice(key.indexOf(":") + 1),
        status: "starting",
      })),
      ...this.unavailable.values(),
    ];
    return { status: summarizeStatus(servers), diagnostics: storeSnapshot.diagnostics, files: storeSnapshot.files, servers };
  }

  async dispose() {
    await Promise.all([...this.clients.values()].map((client) => client.shutdown().catch(() => {})));
  }

  async #startClient(server, key) {
    const client = new LspClient({
      serverId: server.id,
      command: server.command,
      args: server.args,
      cwd: server.root,
      initialization: server.initialization,
      store: this.store,
    });
    try {
      await client.start();
      this.clients.set(key, client);
      this.unavailable.delete(server.id);
      this.#emitOnce(`attached:${key}`, { status: "attached", id: server.id, root: server.root, managed: server.managed });
      return client;
    } catch (err) {
      client.status = "failed";
      const event = { status: "failed", id: server.id, root: server.root, reason: err.message };
      this.unavailable.set(server.id, event);
      this.#emitOnce(`failed:${key}:${err.message}`, event);
      return null;
    }
  }

  #emitOnce(key, event) {
    if (this.announced.has(key)) return;
    this.announced.add(key);
    this.onEvent?.(event);
  }
}

function summarizeStatus(servers) {
  const statuses = servers.map((server) => server.status);
  if (statuses.includes("busy")) return "busy";
  if (statuses.includes("starting")) return "starting";
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("ready") || statuses.includes("idle")) return "idle";
  if (statuses.includes("unavailable")) return "unavailable";
  return "";
}
