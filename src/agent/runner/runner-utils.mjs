import { installCodexTransportCompression } from "./codex-transport-compression.mjs";
import { installCodexWebSocketEventDebug } from "./codex-websocket-event-debug.mjs";
import { installCodexLargeContextGuard } from "./codex-large-context-guard.mjs";

export function installRunnerProcessGuards() {
  installCodexLargeContextGuard();
  installCodexTransportCompression();
  installCodexWebSocketEventDebug();
}

export function providerContextToPayload(providerContext) {
  return {
    messages: [
      { role: "system", content: providerContext.system },
      ...(providerContext.userMessages ?? []).map((message) => ({ role: "user", content: message.content })),
    ],
  };
}

export async function notifyTurnEndBestEffort(turnNotifier, event) {
  if (!turnNotifier?.notifyTurnEnd) return { ok: false, reason: "not-configured", results: [] };
  try {
    return await turnNotifier.notifyTurnEnd(event);
  } catch (err) {
    // Notification must never change turn behavior.
    return { ok: false, reason: err?.message ?? String(err), results: [] };
  }
}

export function notifyTurnEndDetached(turnNotifier, event, onResult = () => {}) {
  const pending = notifyTurnEndBestEffort(turnNotifier, event);
  pending.then(onResult, () => {});
  return pending;
}


export function buildNotificationActivation({ notificationContext, sessionStats }) {
  if (!notificationContext?.projectId) return null;
  return {
    type: "workspace-session",
    projectId: notificationContext.projectId,
    sessionId: sessionStats?.sessionId ?? null,
  };
}