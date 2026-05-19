import {
  getOpenAICodexWebSocketDebugStats,
  resetOpenAICodexWebSocketDebugStats,
} from "@earendil-works/pi-ai/openai-codex-responses";

const FETCH_INSTALLED = Symbol.for("march.codex.largeContextGuard.fetchInstalled");
const ORIGINAL_FETCH = Symbol.for("march.codex.largeContextGuard.originalFetch");
const DEFAULT_MAX_HTTP_FALLBACK_BYTES = 512 * 1024;

export function installCodexLargeContextGuard() {
  if (!isGuardEnabled()) return;
  if (globalThis[FETCH_INSTALLED]) return;
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== "function") return;
  globalThis[ORIGINAL_FETCH] = originalFetch;
  globalThis.fetch = async function marchCodexLargeContextGuardedFetch(input, init) {
    const bodyBytes = getBodyBytes(init?.body);
    if (isCodexResponsesHttpRequest(input, init) && bodyBytes > getMaxHttpFallbackBytes()) {
      throw new Error(`Codex HTTP fallback blocked for large payload (${bodyBytes} bytes); retrying WebSocket instead`);
    }
    return originalFetch.call(this, input, init);
  };
  globalThis[FETCH_INSTALLED] = true;
}

export function applyCodexLargeContextGuardToPayload(payload, { model, session } = {}) {
  if (!isGuardEnabled() || !isCodexModel(model)) return payload;
  const sessionId = session?.sessionId;
  const stats = sessionId ? getOpenAICodexWebSocketDebugStats(sessionId) : null;
  if (stats?.websocketFallbackActive) {
    // pi-ai marks fallback session-wide. Clear it before retry payload assembly so WS gets another chance.
    resetOpenAICodexWebSocketDebugStats(sessionId);
  }
  return payload;
}

function isGuardEnabled() {
  const value = process.env.MARCH_CODEX_LARGE_CONTEXT_GUARD;
  return value !== "0" && value !== "false" && value !== "no";
}

function getMaxHttpFallbackBytes() {
  const raw = process.env.MARCH_CODEX_HTTP_FALLBACK_MAX_BYTES;
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_MAX_HTTP_FALLBACK_BYTES;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_HTTP_FALLBACK_BYTES;
}

function isCodexModel(model) {
  return model?.provider === "openai-codex" || model?.api === "openai-codex-responses";
}

function isCodexResponsesHttpRequest(input, init) {
  const url = getRequestUrl(input);
  if (!url || !url.includes("/codex/responses")) return false;
  const method = init?.method ?? input?.method ?? "GET";
  if (String(method).toUpperCase() !== "POST") return false;
  return headerValue(init?.headers ?? input?.headers, "accept")?.includes("text/event-stream")
    || headerValue(init?.headers ?? input?.headers, "OpenAI-Beta")?.includes("responses=experimental");
}

function getRequestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input && typeof input.url === "string") return input.url;
  return "";
}

function getBodyBytes(body) {
  if (typeof body === "string") return Buffer.byteLength(body);
  if (body instanceof Uint8Array) return body.byteLength;
  if (body instanceof ArrayBuffer) return body.byteLength;
  return 0;
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
