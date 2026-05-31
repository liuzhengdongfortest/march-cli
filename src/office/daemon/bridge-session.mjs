import WebSocket from "ws";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000;

// Owns the daemon-side add-in session contract: hello-gated readiness,
// heartbeat liveness, active-session replacement, and pending RPC failure.
export function createAddinBridge({
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  heartbeatTimeoutMs = DEFAULT_HEARTBEAT_TIMEOUT_MS,
  now = () => Date.now(),
} = {}) {
  let session = null;
  let lastError = null;
  let nextSessionId = 1;
  const pending = new Map();

  function attach(ws) {
    const previous = session;
    const next = {
      id: `addin-${nextSessionId++}`,
      socket: ws,
      info: null,
      attachedAt: now(),
      helloAt: null,
      lastSeenAt: null,
      lastPongAt: null,
      heartbeatTimer: null,
    };
    session = next;
    lastError = null;

    if (previous) {
      failPendingForSession(previous.id, "Office add-in session was replaced");
      closeSocket(previous.socket);
      clearHeartbeat(previous);
    }

    ws.on("message", (data) => handleAddinMessage(next, data));
    ws.on("close", () => detach(next, "Office add-in disconnected"));
    ws.on("error", (err) => {
      if (session === next) lastError = err?.message ?? String(err);
    });
    startHeartbeat(next);
  }

  async function request(method, params = {}, timeoutMs = 30_000) {
    const active = readySession();
    if (!active) throw new Error(notReadyMessage());

    const id = `${now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const message = JSON.stringify({ id, method, params });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Office add-in request timed out: ${method}`));
      }, timeoutMs);
      pending.set(id, { sessionId: active.id, resolve, reject, timer });
      active.socket.send(message, (err) => {
        if (!err) return;
        clearTimeout(timer);
        pending.delete(id);
        reject(err);
      });
    });
  }

  function close() {
    failAllPending("Office daemon is shutting down");
    if (session) {
      clearHeartbeat(session);
      closeSocket(session.socket);
      session = null;
    }
  }

  function isConnected() {
    return Boolean(readySession());
  }

  function info() {
    return session?.info ?? null;
  }

  function status() {
    const active = session;
    const socketOpen = Boolean(active && active.socket.readyState === WebSocket.OPEN);
    const ready = Boolean(socketOpen && active.info);
    return {
      lifecycle: ready ? "ready" : socketOpen ? "handshaking" : "disconnected",
      connected: ready,
      socketOpen,
      addin: active?.info ?? null,
      sessionId: active?.id ?? null,
      attachedAt: active?.attachedAt ?? null,
      helloAt: active?.helloAt ?? null,
      lastSeenAt: active?.lastSeenAt ?? null,
      lastPongAt: active?.lastPongAt ?? null,
      pendingCount: pending.size,
      lastError,
    };
  }

  function handleAddinMessage(active, data) {
    if (session !== active) return;
    let msg;
    try { msg = JSON.parse(String(data)); } catch { return; }
    active.lastSeenAt = now();

    if (msg.type === "hello") {
      active.info = msg.info ?? null;
      active.helloAt = now();
      active.lastPongAt = active.helloAt;
      return;
    }
    if (msg.type === "pong") {
      active.lastPongAt = now();
      return;
    }

    const entry = pending.get(msg.id);
    if (!entry || entry.sessionId !== active.id) return;
    clearTimeout(entry.timer);
    pending.delete(msg.id);
    msg.ok === false ? entry.reject(new Error(formatAddinError(msg.error))) : entry.resolve(msg.result);
  }

  function startHeartbeat(active) {
    if (heartbeatIntervalMs <= 0) return;
    active.heartbeatTimer = setInterval(() => {
      if (session !== active) return clearHeartbeat(active);
      if (active.socket.readyState !== WebSocket.OPEN) return;

      const lastLiveAt = active.lastPongAt ?? active.helloAt ?? active.attachedAt;
      if (now() - lastLiveAt > heartbeatTimeoutMs) {
        lastError = "Office add-in heartbeat timed out";
        closeSocket(active.socket);
        detach(active, lastError);
        return;
      }

      try {
        active.socket.send(JSON.stringify({ type: "ping", ts: now() }));
      } catch (err) {
        lastError = err?.message ?? String(err);
        closeSocket(active.socket);
        detach(active, lastError);
      }
    }, heartbeatIntervalMs);
    active.heartbeatTimer.unref?.();
  }

  function detach(active, reason) {
    if (session !== active) return;
    clearHeartbeat(active);
    failPendingForSession(active.id, reason);
    session = null;
  }

  function readySession() {
    return session && session.socket.readyState === WebSocket.OPEN && session.info ? session : null;
  }

  function notReadyMessage() {
    const current = status();
    if (!current.socketOpen) return "Office add-in is not connected. Run: march office install";
    return "Office add-in socket is connected but not ready yet";
  }

  function failAllPending(message) {
    for (const id of pending.keys()) failPending(id, message);
  }

  function failPendingForSession(sessionId, message) {
    for (const [id, entry] of pending) {
      if (entry.sessionId === sessionId) failPending(id, message);
    }
  }

  function failPending(id, message) {
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(id);
    entry.reject(new Error(message));
  }

  return { attach, request, close, isConnected, info, status };
}

function clearHeartbeat(active) {
  if (!active?.heartbeatTimer) return;
  clearInterval(active.heartbeatTimer);
  active.heartbeatTimer = null;
}

function closeSocket(socket) {
  if (!socket || socket.readyState === WebSocket.CLOSED) return;
  try { socket.close(); } catch {}
}

export function formatAddinError(error) {
  if (!error) return "Office add-in request failed";
  if (typeof error === "string") return error;
  const logs = Array.isArray(error.logs) && error.logs.length > 0 ? `\nLogs:\n${error.logs.map((entry) => `[${entry.level}] ${entry.message}`).join("\n")}` : "";
  if (typeof error.stack === "string" && error.stack) return `${error.stack}${logs}`;
  if (typeof error.message === "string" && error.message) return `${error.message}${logs}`;
  return safeStringify(error);
}

function safeStringify(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}
