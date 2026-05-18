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
