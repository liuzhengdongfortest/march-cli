import zlib from "node:zlib";
import WsWebSocket from "ws";

const FETCH_INSTALLED = Symbol.for("march.codex.transportCompression.fetchInstalled");
const WEBSOCKET_INSTALLED = Symbol.for("march.codex.transportCompression.websocketInstalled");
const ORIGINAL_FETCH = Symbol.for("march.codex.transportCompression.originalFetch");
const ORIGINAL_WEBSOCKET = Symbol.for("march.codex.transportCompression.originalWebSocket");
const STATS = Symbol.for("march.codex.transportCompression.stats");
const DEFAULT_MIN_ZSTD_BYTES = 1024;

export function installCodexTransportCompression() {
  if (!isCompressionEnabled()) return;
  installCodexHttpCompression();
  installCodexWebSocketCompression();
}

export function getCodexTransportCompressionStats() {
  return globalThis[STATS] ?? null;
}

function installCodexHttpCompression() {
  if (!isHttpCompressionEnabled() || globalThis[FETCH_INSTALLED]) return;
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== "function" || typeof zlib.zstdCompressSync !== "function") return;
  globalThis[ORIGINAL_FETCH] = originalFetch;
  globalThis.fetch = async function marchCodexCompressedFetch(input, init = {}) {
    if (!isCodexResponsesHttpRequest(input, init) || hasHeader(init.headers ?? input?.headers, "content-encoding")) {
      return originalFetch.call(this, input, init);
    }
    const body = init?.body;
    const plain = toBuffer(body);
    if (!plain || plain.byteLength < getMinZstdBytes()) return originalFetch.call(this, input, init);

    const compressed = zlib.zstdCompressSync(plain, {
      params: { [zlib.constants.ZSTD_c_compressionLevel]: 3 },
    });
    const headers = new Headers(init.headers ?? input?.headers ?? {});
    headers.set("content-encoding", "zstd");
    headers.set("content-type", headers.get("content-type") ?? "application/json");
    recordHttpCompression(plain.byteLength, compressed.byteLength);
    return originalFetch.call(this, input, { ...init, headers, body: compressed });
  };
  globalThis[FETCH_INSTALLED] = true;
}

function installCodexWebSocketCompression() {
  if (!isWebSocketCompressionEnabled() || globalThis[WEBSOCKET_INSTALLED]) return;
  const OriginalWebSocket = globalThis.WebSocket;
  if (typeof OriginalWebSocket !== "function") return;
  globalThis[ORIGINAL_WEBSOCKET] = OriginalWebSocket;

  class MarchCodexCompressedWebSocket extends WsWebSocket {
    constructor(url, protocolsOrOptions, maybeOptions) {
      if (!isCodexResponsesWebSocketUrl(url)) {
        return new OriginalWebSocket(url, protocolsOrOptions, maybeOptions);
      }
      const { protocols, options } = normalizeWebSocketArgs(protocolsOrOptions, maybeOptions);
      super(url, protocols, {
        ...options,
        perMessageDeflate: options.perMessageDeflate ?? true,
      });
      recordWebSocketCompression();
    }
  }
  copyReadyStateConstants(MarchCodexCompressedWebSocket, OriginalWebSocket);
  globalThis.WebSocket = MarchCodexCompressedWebSocket;
  globalThis[WEBSOCKET_INSTALLED] = true;
}

function normalizeWebSocketArgs(protocolsOrOptions, maybeOptions) {
  if (isOptionsObject(protocolsOrOptions) && maybeOptions === undefined) {
    return { protocols: [], options: protocolsOrOptions };
  }
  return { protocols: protocolsOrOptions ?? [], options: maybeOptions ?? {} };
}

function isOptionsObject(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value) || value instanceof String) return false;
  return "headers" in value || "perMessageDeflate" in value || "handshakeTimeout" in value;
}

function copyReadyStateConstants(Target, OriginalWebSocket) {
  for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
    const value = OriginalWebSocket[key] ?? WsWebSocket[key];
    if (typeof value === "number") Object.defineProperty(Target, key, { value, enumerable: true });
  }
}

function isCompressionEnabled() {
  return isEnabled(process.env.MARCH_CODEX_TRANSPORT_COMPRESSION, true);
}

function isHttpCompressionEnabled() {
  return isEnabled(process.env.MARCH_CODEX_HTTP_COMPRESSION, true);
}

function isWebSocketCompressionEnabled() {
  return isEnabled(process.env.MARCH_CODEX_WS_COMPRESSION, true);
}

function isEnabled(value, fallback) {
  if (value === undefined) return fallback;
  return value !== "0" && value !== "false" && value !== "no";
}

function getMinZstdBytes() {
  const raw = process.env.MARCH_CODEX_HTTP_COMPRESSION_MIN_BYTES;
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_MIN_ZSTD_BYTES;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MIN_ZSTD_BYTES;
}

function isCodexResponsesHttpRequest(input, init) {
  const url = getRequestUrl(input);
  if (!url || !url.includes("/codex/responses")) return false;
  const method = init?.method ?? input?.method ?? "GET";
  if (String(method).toUpperCase() !== "POST") return false;
  return headerValue(init?.headers ?? input?.headers, "accept").includes("text/event-stream")
    || headerValue(init?.headers ?? input?.headers, "OpenAI-Beta").includes("responses=experimental");
}

function isCodexResponsesWebSocketUrl(url) {
  const raw = getRequestUrl(url);
  if (!raw || !raw.includes("/codex/responses")) return false;
  return raw.startsWith("ws://") || raw.startsWith("wss://");
}

function getRequestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input && typeof input.url === "string") return input.url;
  return "";
}

function toBuffer(body) {
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  return null;
}

function hasHeader(headers, name) {
  return headerValue(headers, name).length > 0;
}

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) ?? headers.get(name.toLowerCase()) ?? "";
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) return String(value ?? "");
  }
  return "";
}

function recordHttpCompression(preBytes, postBytes) {
  const stats = ensureStats();
  stats.httpZstdRequests += 1;
  stats.lastHttpPreBytes = preBytes;
  stats.lastHttpPostBytes = postBytes;
  stats.lastHttpRatio = Number((postBytes / preBytes).toFixed(4));
}

function recordWebSocketCompression() {
  const stats = ensureStats();
  stats.wsCompressedConnections += 1;
  stats.wsPerMessageDeflate = true;
}

function ensureStats() {
  globalThis[STATS] = globalThis[STATS] ?? {
    httpZstdRequests: 0,
    lastHttpPreBytes: 0,
    lastHttpPostBytes: 0,
    lastHttpRatio: 0,
    wsCompressedConnections: 0,
    wsPerMessageDeflate: false,
  };
  return globalThis[STATS];
}
