const SOCKET_SESSION_ID = Symbol.for("march.codex.websocket.sessionId");
const SOCKET_LISTENERS = Symbol.for("march.codex.websocket.listeners");
const DEBUG_EVENTS_KEY = Symbol.for("march.codex.websocket.debugEvents");
const ORIGINAL_WEBSOCKET_KEY = Symbol.for("march.codex.websocket.originalConstructor");

export function installCodexWebSocketEventDebug() {
  if (!isCodexTransportDebugEnabled()) return;
  const OriginalWebSocket = globalThis.WebSocket;
  if (typeof OriginalWebSocket !== "function") return;
  if (globalThis[ORIGINAL_WEBSOCKET_KEY]) return;

  globalThis[DEBUG_EVENTS_KEY] = globalThis[DEBUG_EVENTS_KEY] ?? new Map();
  globalThis[ORIGINAL_WEBSOCKET_KEY] = OriginalWebSocket;

  class MarchDebugWebSocket extends OriginalWebSocket {
    constructor(...args) {
      super(...args);
      this[SOCKET_SESSION_ID] = extractSessionId(args[1]) ?? extractSessionId(args[2]) ?? null;
      this[SOCKET_LISTENERS] = new Map();
    }

    addEventListener(type, listener, options) {
      if ((type !== "error" && type !== "close") || !listener) {
        return super.addEventListener(type, listener, options);
      }
      const wrapped = wrapListener(this, type, listener);
      rememberWrappedListener(this, type, listener, wrapped);
      return super.addEventListener(type, wrapped, options);
    }

    removeEventListener(type, listener, options) {
      const wrapped = takeWrappedListener(this, type, listener) ?? listener;
      return super.removeEventListener(type, wrapped, options);
    }
  }

  globalThis.WebSocket = MarchDebugWebSocket;
}

export function getCodexWebSocketLastEvent(sessionId) {
  if (!sessionId) return null;
  return globalThis[DEBUG_EVENTS_KEY]?.get(sessionId) ?? null;
}

function isCodexTransportDebugEnabled() {
  const value = process.env.MARCH_CODEX_TRANSPORT_DEBUG;
  return value === "1" || value === "true" || value === "yes";
}

function extractSessionId(options) {
  const headers = options?.headers;
  if (!headers || typeof headers !== "object") return null;
  const value = headers.session_id ?? headers["session_id"] ?? headers["x-client-request-id"] ?? headers["X-Client-Request-Id"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function wrapListener(socket, type, listener) {
  return function marchCodexWebSocketDebugListener(event) {
    recordWebSocketEvent(socket, type, event);
    if (typeof listener === "function") return listener.call(this, event);
    return listener.handleEvent?.(event);
  };
}

function rememberWrappedListener(socket, type, listener, wrapped) {
  let byType = socket[SOCKET_LISTENERS].get(type);
  if (!byType) {
    byType = new Map();
    socket[SOCKET_LISTENERS].set(type, byType);
  }
  byType.set(listener, wrapped);
}

function takeWrappedListener(socket, type, listener) {
  const byType = socket[SOCKET_LISTENERS]?.get(type);
  if (!byType) return null;
  const wrapped = byType.get(listener);
  byType.delete(listener);
  return wrapped ?? null;
}

function recordWebSocketEvent(socket, type, event) {
  const sessionId = socket[SOCKET_SESSION_ID];
  if (!sessionId) return;
  const events = globalThis[DEBUG_EVENTS_KEY].get(sessionId) ?? {};
  const summary = summarizeWebSocketEvent(socket, type, event);
  events.lastEvent = summary;
  if (type === "error") events.lastErrorEvent = summary;
  if (type === "close") events.lastCloseEvent = summary;
  globalThis[DEBUG_EVENTS_KEY].set(sessionId, events);
}

function summarizeWebSocketEvent(socket, type, event) {
  const nestedError = event && typeof event === "object" && "error" in event ? event.error : null;
  return {
    phase: type,
    type: readString(event, "type") ?? type,
    eventKeys: getEventKeys(event),
    eventMessage: readString(event, "message"),
    errorName: readString(nestedError, "name"),
    errorMessage: readString(nestedError, "message"),
    errorCode: readString(nestedError, "code") ?? readNumber(nestedError, "code"),
    errorString: nestedError ? String(nestedError) : undefined,
    closeCode: readNumber(event, "code"),
    closeReason: readString(event, "reason"),
    closeWasClean: readBoolean(event, "wasClean"),
    readyState: typeof socket.readyState === "number" ? socket.readyState : undefined,
  };
}

function getEventKeys(event) {
  if (!event || typeof event !== "object") return [];
  return [...new Set([...Object.keys(event), "type", "message", "error", "code", "reason", "wasClean"].filter((key) => key in event))];
}

function readString(value, key) {
  const field = value && typeof value === "object" ? value[key] : undefined;
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function readNumber(value, key) {
  const field = value && typeof value === "object" ? value[key] : undefined;
  return typeof field === "number" ? field : undefined;
}

function readBoolean(value, key) {
  const field = value && typeof value === "object" ? value[key] : undefined;
  return typeof field === "boolean" ? field : undefined;
}

