import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { extname } from "node:path";
import { readFileSync } from "node:fs";

const INITIALIZE_TIMEOUT_MS = 15000;
const TEXT_DOCUMENT_SYNC_INCREMENTAL = 2;

const LANGUAGE_IDS = {
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".vue": "vue",
};

export class LspClient {
  constructor({ serverId, command, args = [], cwd, initialization = {}, store }) {
    this.serverId = serverId;
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.initialization = initialization;
    this.store = store;
    this.status = "starting";
    this.process = null;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    this.documents = new Map();
    this.syncKind = null;
  }

  async start() {
    this.process = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.process.stdout.on("data", (chunk) => this.#onData(chunk));
    this.process.on("exit", () => {
      this.status = "failed";
      for (const pending of this.pending.values()) pending.reject(new Error("LSP exited"));
      this.pending.clear();
    });

    const initialized = await withTimeout(this.#request("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(this.cwd).href,
      workspaceFolders: [{ name: "workspace", uri: pathToFileURL(this.cwd).href }],
      initializationOptions: this.initialization,
      capabilities: {
        workspace: {
          configuration: true,
          workspaceFolders: true,
        },
        textDocument: {
          synchronization: {
            didOpen: true,
            didChange: true,
          },
          publishDiagnostics: {},
        },
      },
    }), INITIALIZE_TIMEOUT_MS);
    this.syncKind = getSyncKind(initialized?.capabilities);
    this.#notify("initialized", {});
    this.status = "ready";
  }

  touchFile(path) {
    if (this.status === "failed") return;
    const text = readFileSync(path, "utf8");
    const uri = pathToFileURL(path).href;
    const existing = this.documents.get(path);
    this.status = "busy";
    if (existing) {
      const version = existing.version + 1;
      this.documents.set(path, { version, text });
      this.#notify("textDocument/didChange", {
        textDocument: { uri, version },
        contentChanges: this.syncKind === TEXT_DOCUMENT_SYNC_INCREMENTAL
          ? [{ range: { start: { line: 0, character: 0 }, end: endPosition(existing.text) }, text }]
          : [{ text }],
      });
      return;
    }
    this.documents.set(path, { version: 0, text });
    this.#notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: LANGUAGE_IDS[extname(path).toLowerCase()] ?? "plaintext",
        version: 0,
        text,
      },
    });
  }

  async shutdown() {
    if (!this.process) return;
    try { this.#notify("shutdown", null); } catch {}
    this.process.kill();
  }

  #onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this.buffer.slice(0, headerEnd).toString("utf8");
      const match = header.match(/Content-Length: (\d+)/i);
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + length;
      if (this.buffer.length < messageEnd) return;
      const raw = this.buffer.slice(messageStart, messageEnd).toString("utf8");
      this.buffer = this.buffer.slice(messageEnd);
      try {
        this.#handleMessage(JSON.parse(raw));
      } catch {}
    }
  }

  #handleMessage(message) {
    if (message.id !== undefined && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? "LSP request failed"));
      else pending.resolve(message.result);
      return;
    }

    if (message.method === "textDocument/publishDiagnostics") {
      this.store.replaceFile({
        serverId: this.serverId,
        uri: message.params?.uri,
        diagnostics: message.params?.diagnostics ?? [],
      });
      this.status = "idle";
      return;
    }

    if (message.id !== undefined && message.method) {
      this.#send({ jsonrpc: "2.0", id: message.id, result: this.#requestResult(message.method) });
    }
  }

  #requestResult(method) {
    if (method === "workspace/configuration") return [];
    if (method === "workspace/workspaceFolders") return [{ name: "workspace", uri: pathToFileURL(this.cwd).href }];
    if (method === "window/workDoneProgress/create") return null;
    if (method === "client/registerCapability") return null;
    if (method === "client/unregisterCapability") return null;
    return null;
  }

  #request(method, params) {
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.#send({ jsonrpc: "2.0", id, method, params });
    return promise;
  }

  #notify(method, params) {
    this.#send({ jsonrpc: "2.0", method, params });
  }

  #send(message) {
    const body = JSON.stringify(message);
    this.process.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("LSP initialize timed out")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function getSyncKind(capabilities) {
  const sync = capabilities?.textDocumentSync;
  if (typeof sync === "number") return sync;
  return sync?.change ?? null;
}

function endPosition(text) {
  const lines = text.split(/\r\n|\r|\n/);
  return { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 };
}
