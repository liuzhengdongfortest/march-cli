const CHANNEL = "march-runtime";

export function createRuntimeIpcPeer({ send, subscribe, target = {}, timeoutMs = 0 } = {}) {
  if (typeof send !== "function") throw new Error("send is required");
  if (typeof subscribe !== "function") throw new Error("subscribe is required");

  let nextId = 1;
  const pending = new Map();
  const detach = subscribe((message) => handleMessage(message));

  return {
    call(method, ...args) {
      const id = nextId++;
      const result = waitForResult(id, { timeoutMs, pending });
      send({ channel: CHANNEL, kind: "request", id, method, args });
      return result;
    },
    notify(method, ...args) {
      send({ channel: CHANNEL, kind: "notify", method, args });
    },
    dispose() {
      detach?.();
      for (const { reject, timer } of pending.values()) {
        if (timer) clearTimeout(timer);
        reject(new Error("runtime IPC peer disposed"));
      }
      pending.clear();
    },
  };

  async function handleMessage(message) {
    if (!isRuntimeMessage(message)) return;
    if (message.kind === "result" || message.kind === "error") {
      settlePending(message, pending);
      return;
    }
    if (message.kind === "notify") {
      await invokeTarget(message, target);
      return;
    }
    if (message.kind === "request") {
      try {
        const result = await invokeTarget(message, target);
        send({ channel: CHANNEL, kind: "result", id: message.id, result });
      } catch (error) {
        send({ channel: CHANNEL, kind: "error", id: message.id, error: serializeError(error) });
      }
    }
  }
}

function waitForResult(id, { timeoutMs, pending }) {
  return new Promise((resolve, reject) => {
    const timer = timeoutMs > 0
      ? setTimeout(() => {
        pending.delete(id);
        reject(new Error(`runtime IPC request timed out: ${id}`));
      }, timeoutMs)
      : null;
    pending.set(id, { resolve, reject, timer });
  });
}

function settlePending(message, pending) {
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (entry.timer) clearTimeout(entry.timer);
  if (message.kind === "result") {
    entry.resolve(message.result);
  } else {
    entry.reject(deserializeError(message.error));
  }
}

async function invokeTarget(message, target) {
  const method = target[message.method];
  if (typeof method !== "function") throw new Error(`unknown runtime IPC method: ${message.method}`);
  return method(...(message.args ?? []));
}

function isRuntimeMessage(message) {
  return message?.channel === CHANNEL && typeof message.kind === "string";
}

function serializeError(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    stack: error?.stack,
  };
}

function deserializeError(error) {
  const result = new Error(error?.message ?? "runtime IPC error");
  result.name = error?.name ?? "Error";
  if (error?.stack) result.stack = error.stack;
  return result;
}
