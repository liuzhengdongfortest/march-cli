export function normalizeGatewayMessage(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Gateway message must be an object");
  }
  const platform = cleanRequiredString(input.platform, "platform");
  const chatId = cleanRequiredString(input.chatId ?? input.chat_id, "chatId");
  const userId = cleanRequiredString(input.userId ?? input.user_id, "userId");
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) throw new Error("Gateway message text is required");

  return {
    platform,
    chatId,
    userId,
    threadId: cleanOptionalString(input.threadId ?? input.thread_id),
    messageId: cleanOptionalString(input.messageId ?? input.message_id),
    text,
    receivedAt: input.receivedAt ?? input.received_at ?? new Date().toISOString(),
  };
}

export function gatewaySessionKey(message) {
  const thread = message.threadId ? `:thread:${message.threadId}` : "";
  return `${message.platform}:chat:${message.chatId}${thread}`;
}

function cleanRequiredString(value, field) {
  const clean = cleanOptionalString(value);
  if (!clean) throw new Error(`Gateway message ${field} is required`);
  return clean;
}

function cleanOptionalString(value) {
  if (value == null) return null;
  const clean = String(value).trim();
  return clean || null;
}
