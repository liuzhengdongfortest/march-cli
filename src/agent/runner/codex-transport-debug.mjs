import { getOpenAICodexWebSocketDebugStats } from "@earendil-works/pi-ai/openai-codex-responses";

export function getCodexTransportDebugSnapshot(session) {
  if (!isCodexTransportDebugEnabled()) return null;
  const sessionId = session?.sessionId;
  return sessionId ? (getOpenAICodexWebSocketDebugStats(sessionId) ?? null) : null;
}

export function dumpCodexTransportDebug({ before, session, ui, logger }) {
  if (!isCodexTransportDebugEnabled()) return;
  const sessionId = session?.sessionId;
  const after = sessionId ? (getOpenAICodexWebSocketDebugStats(sessionId) ?? null) : null;
  const fields = formatCodexTransportDebugFields(sessionId, before, after);
  logger?.event("codex.transport", fields);
  writeCodexTransportDebug(ui, formatCodexTransportDebugLines(fields));
}

function isCodexTransportDebugEnabled() {
  const value = process.env.MARCH_CODEX_TRANSPORT_DEBUG;
  return value === "1" || value === "true" || value === "yes";
}

function formatCodexTransportDebugFields(sessionId, before, after) {
  const delta = (key) => (after?.[key] ?? 0) - (before?.[key] ?? 0);
  return {
    sessionId: sessionId ?? "unknown",
    requests: delta("requests"),
    totalRequests: after?.requests ?? 0,
    connectionsCreated: delta("connectionsCreated"),
    connectionsReused: delta("connectionsReused"),
    cachedContextRequests: delta("cachedContextRequests"),
    storeTrueRequests: delta("storeTrueRequests"),
    fullContextRequests: delta("fullContextRequests"),
    deltaRequests: delta("deltaRequests"),
    websocketFailures: delta("websocketFailures"),
    sseFallbacks: delta("sseFallbacks"),
    websocketFallbackActive: Boolean(after?.websocketFallbackActive),
    lastInputItems: after?.lastInputItems ?? 0,
    lastDeltaInputItems: after?.lastDeltaInputItems ?? 0,
    lastWebSocketError: after?.lastWebSocketError ?? null,
    hasStats: Boolean(after),
  };
}

function formatCodexTransportDebugLines(fields) {
  if (!fields.hasStats) return [`[codex-transport] sessionId=${fields.sessionId} no Codex WebSocket stats`];
  return [
    `[codex-transport] sessionId=${fields.sessionId}`,
    `  requests=${fields.requests} totalRequests=${fields.totalRequests}`,
    `  wsConnections created=${fields.connectionsCreated} reused=${fields.connectionsReused}`,
    `  modes full=${fields.fullContextRequests} delta=${fields.deltaRequests} cached=${fields.cachedContextRequests} storeTrue=${fields.storeTrueRequests}`,
    `  fallback websocketFailures=${fields.websocketFailures} sseFallbacks=${fields.sseFallbacks} active=${fields.websocketFallbackActive}`,
    `  lastInputItems=${fields.lastInputItems} lastDeltaInputItems=${fields.lastDeltaInputItems}`,
    ...(fields.lastWebSocketError ? [`  lastWebSocketError=${fields.lastWebSocketError}`] : []),
  ];
}

function writeCodexTransportDebug(ui, lines) {
  const writeLine = ui?.writeln ?? ui?.status;
  if (!writeLine) return;
  for (const line of lines) writeLine(line);
}
