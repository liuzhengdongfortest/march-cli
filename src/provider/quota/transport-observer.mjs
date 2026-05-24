const FETCH_INSTALLED = Symbol.for("march.providerQuota.fetchObserverInstalled");
const WEBSOCKET_INSTALLED = Symbol.for("march.providerQuota.websocketObserverInstalled");
const LISTENERS = Symbol.for("march.providerQuota.transportListeners");

export function installProviderQuotaTransportObserver() {
  installFetchObserver();
  installWebSocketObserver();
}

export function subscribeProviderQuotaTransport(listener) {
  const listeners = ensureListeners();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function installFetchObserver() {
  if (globalThis[FETCH_INSTALLED]) return;
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== "function") return;
  globalThis.fetch = async function marchProviderQuotaFetch(input, init = {}) {
    const response = await originalFetch.call(this, input, init);
    if (isCodexResponsesHttpRequest(input, init)) {
      notifyTransportListeners({ providerId: "openai-codex", source: "headers", headers: response.headers });
    }
    return response;
  };
  globalThis[FETCH_INSTALLED] = true;
}

function installWebSocketObserver() {
  if (globalThis[WEBSOCKET_INSTALLED]) return;
  const OriginalWebSocket = globalThis.WebSocket;
  if (typeof OriginalWebSocket !== "function") return;

  class MarchProviderQuotaWebSocket extends OriginalWebSocket {
    constructor(url, protocolsOrOptions, maybeOptions) {
      if (!isCodexResponsesWebSocketUrl(url)) {
        return new OriginalWebSocket(url, protocolsOrOptions, maybeOptions);
      }
      super(url, protocolsOrOptions, maybeOptions);
      this.addEventListener?.("message", async (event) => {
        const payload = await decodeWebSocketData(event?.data).catch(() => null);
        if (payload?.includes?.('"codex.rate_limits"')) {
          notifyTransportListeners({ providerId: "openai-codex", source: "event", payload });
        }
      });
    }
  }
  copyReadyStateConstants(MarchProviderQuotaWebSocket, OriginalWebSocket);
  globalThis.WebSocket = MarchProviderQuotaWebSocket;
  globalThis[WEBSOCKET_INSTALLED] = true;
}

function ensureListeners() {
  globalThis[LISTENERS] = globalThis[LISTENERS] ?? new Set();
  return globalThis[LISTENERS];
}

function notifyTransportListeners(event) {
  for (const listener of [...ensureListeners()]) {
    try {
      listener(event);
    } catch {}
  }
}

function isCodexResponsesHttpRequest(input, init) {
  const url = getRequestUrl(input);
  if (!url || !url.includes("/codex/responses")) return false;
  const method = init?.method ?? input?.method ?? "GET";
  return String(method).toUpperCase() === "POST";
}

function isCodexResponsesWebSocketUrl(url) {
  const raw = getRequestUrl(url);
  return Boolean(raw?.includes("/codex/responses") && (raw.startsWith("ws://") || raw.startsWith("wss://")));
}

function getRequestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input && typeof input.url === "string") return input.url;
  return "";
}

async function decodeWebSocketData(data) {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  if (data && typeof data.arrayBuffer === "function") return new TextDecoder().decode(new Uint8Array(await data.arrayBuffer()));
  return null;
}

function copyReadyStateConstants(Target, OriginalWebSocket) {
  for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
    const value = OriginalWebSocket[key];
    if (typeof value === "number") Object.defineProperty(Target, key, { value, enumerable: true });
  }
}
