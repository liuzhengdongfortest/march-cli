import { LspClient } from "./client.mjs";
import { LspDiagnosticStore } from "./diagnostic-store.mjs";
import { resolveLspServer } from "./servers.mjs";

export class LspService {
  constructor({ cwd }) {
    this.cwd = cwd;
    this.store = new LspDiagnosticStore();
    this.clients = new Map();
    this.spawning = new Map();
  }

  touchFile(path) {
    const server = resolveLspServer({ filePath: path, workspaceRoot: this.cwd });
    if (!server) return;
    const key = `${server.id}:${server.root}`;
    const existing = this.clients.get(key);
    if (existing) {
      existing.touchFile(path);
      return;
    }
    if (this.spawning.has(key)) {
      this.spawning.get(key).then((client) => client?.touchFile(path)).catch(() => {});
      return;
    }
    const task = this.#startClient(server, key).then((client) => {
      client?.touchFile(path);
      return client;
    });
    this.spawning.set(key, task);
    task.finally(() => {
      if (this.spawning.get(key) === task) this.spawning.delete(key);
    }).catch(() => {});
  }

  snapshot() {
    const diagnostics = this.store.snapshot();
    const statuses = [...this.clients.values()].map((client) => client.status);
    const status = statuses.includes("busy") ? "busy" : statuses.includes("starting") ? "starting" : statuses.includes("failed") ? "failed" : statuses.length > 0 ? "idle" : "";
    return { status, diagnostics };
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
      return client;
    } catch {
      client.status = "failed";
      return null;
    }
  }
}
