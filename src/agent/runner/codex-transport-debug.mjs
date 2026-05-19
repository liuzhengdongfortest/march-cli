import { getOpenAICodexWebSocketDebugStats } from "@earendil-works/pi-ai/openai-codex-responses";
import { getCodexWebSocketLastEvent } from "./codex-websocket-event-debug.mjs";

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
    lastWebSocketEvent: getCodexWebSocketLastEvent(sessionId),
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
    `  error lastWebSocketError=${formatDebugValue(fields.lastWebSocketError)}`,
    ...formatWebSocketEventLines(fields.lastWebSocketEvent),
    `  lastInputItems=${fields.lastInputItems} lastDeltaInputItems=${fields.lastDeltaInputItems}`,
  ];
}

function formatWebSocketEventLines(events) {
  if (!events) return ["  wsEvent none"];
  return [
    ...formatSingleWebSocketEvent("wsEvent", events.lastEvent),
    ...formatSingleWebSocketEvent("wsError", events.lastErrorEvent),
    ...formatSingleWebSocketCloseEvent(events.lastCloseEvent),
  ];
}

function formatSingleWebSocketEvent(prefix, event) {
  if (!event) return [`  ${prefix} none`];
  return [
    `  ${prefix} phase=${formatDebugValue(event.phase)} type=${formatDebugValue(event.type)} keys=${formatDebugValue(event.eventKeys)} readyState=${formatDebugValue(event.readyState)}`,
    `  ${prefix} errorName=${formatDebugValue(event.errorName)} errorMessage=${formatDebugValue(event.errorMessage)} errorCode=${formatDebugValue(event.errorCode)} errorString=${formatDebugValue(event.errorString)} eventMessage=${formatDebugValue(event.eventMessage)}`,
  ];
}

function formatSingleWebSocketCloseEvent(event) {
  if (!event) return ["  wsClose none"];
  return [`  wsClose code=${formatDebugValue(event.closeCode)} reason=${formatDebugValue(event.closeReason)} wasClean=${formatDebugValue(event.closeWasClean)} readyState=${formatDebugValue(event.readyState)}`];
}

function formatDebugValue(value) {
  if (value === null || value === undefined || value === "") return "none";
  if (typeof value === "string") return JSON.stringify(value);
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

function writeCodexTransportDebug(ui, lines) {
  if (ui?.debugLines) {
    ui.debugLines(lines);
    return;
  }
  if (!ui?.writeln) return;
  for (const line of lines) ui.writeln(line);
}
