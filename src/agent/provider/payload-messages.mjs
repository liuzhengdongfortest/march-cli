export function replaceProviderSystemPrompt(payload, systemPrompt) {
  if (!payload || typeof payload !== "object" || !systemPrompt) return payload;
  if (payload.body && typeof payload.body === "object") {
    const body = replaceProviderSystemPrompt(payload.body, systemPrompt);
    return body === payload.body ? payload : { ...payload, body };
  }
  if (typeof payload.body === "string") {
    try {
      const body = JSON.parse(payload.body);
      const replaced = replaceProviderSystemPrompt(body, systemPrompt);
      return replaced === body ? payload : { ...payload, body: JSON.stringify(replaced) };
    } catch {
      return payload;
    }
  }
  if (!Array.isArray(payload.messages)) return payload;
  return {
    ...payload,
    messages: [
      { role: "system", content: systemPrompt },
      ...payload.messages.filter((message) => message?.role !== "system"),
    ],
  };
}

export function replaceProviderContextMessages(payload, providerContext) {
  if (!payload || typeof payload !== "object" || !providerContext?.system) return payload;
  if (payload.body && typeof payload.body === "object") {
    const body = replaceProviderContextMessages(payload.body, providerContext);
    return body === payload.body ? payload : { ...payload, body };
  }
  if (typeof payload.body === "string") {
    try {
      const body = JSON.parse(payload.body);
      const replaced = replaceProviderContextMessages(body, providerContext);
      return replaced === body ? payload : { ...payload, body: JSON.stringify(replaced) };
    } catch {
      return payload;
    }
  }
  if (Array.isArray(payload.messages)) return replaceChatMessagesPayload(payload, providerContext);
  if (Array.isArray(payload.input) && typeof payload.instructions === "string") return replaceResponsesPayload(payload, providerContext);
  return payload;
}

export function appendProviderUserMessage(payload, content) {
  if (!payload || typeof payload !== "object" || !content) return payload;
  if (payload.body && typeof payload.body === "object") {
    const body = appendProviderUserMessage(payload.body, content);
    return body === payload.body ? payload : { ...payload, body };
  }
  if (typeof payload.body === "string") {
    try {
      const body = JSON.parse(payload.body);
      const appended = appendProviderUserMessage(body, content);
      return appended === body ? payload : { ...payload, body: JSON.stringify(appended) };
    } catch {
      return payload;
    }
  }
  if (Array.isArray(payload.messages)) {
    return {
      ...payload,
      messages: [...payload.messages, { role: "user", content }],
    };
  }
  if (Array.isArray(payload.input) && typeof payload.instructions === "string") {
    return {
      ...payload,
      input: [...payload.input, { role: "user", content: [{ type: "input_text", text: content }] }],
    };
  }
  return payload;
}

function replaceChatMessagesPayload(payload, providerContext) {
  const originalUser = payload.messages.findLast?.((message) => message?.role === "user")
    ?? [...payload.messages].reverse().find((message) => message?.role === "user");
  const userMessages = (providerContext.userMessages ?? []).filter((message) => message?.content);
  const contextMessages = userMessages.map((message, index) => ({
    role: "user",
    content: index === userMessages.length - 1 ? contentWithOriginalNonTextParts(message.content, originalUser) : message.content,
  }));
  return {
    ...payload,
    messages: [
      { role: "system", content: providerContext.system },
      ...contextMessages,
      ...payload.messages.filter((message) => message?.role !== "system" && message?.role !== "user"),
    ],
  };
}

function replaceResponsesPayload(payload, providerContext) {
  const userMessages = (providerContext.userMessages ?? []).filter((message) => message?.content);
  const originalUser = payload.input.findLast?.((item) => item?.role === "user")
    ?? [...payload.input].reverse().find((item) => item?.role === "user");
  return {
    ...payload,
    instructions: providerContext.system,
    input: [
      ...userMessages.map((message, index) => ({
        role: "user",
        content: index === userMessages.length - 1
          ? responsesContentWithOriginalNonTextParts(message.content, originalUser)
          : [{ type: "input_text", text: message.content }],
      })),
      ...payload.input.filter((item) => item?.role !== "user"),
    ],
  };
}

function responsesContentWithOriginalNonTextParts(text, originalUser) {
  return [{ type: "input_text", text }, ...responsesNonTextContentParts(originalUser?.content)];
}

function responsesNonTextContentParts(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((part) => {
    if (!part || typeof part !== "object") return false;
    if (part.type === "input_text" || part.type === "text" || typeof part.text === "string") return false;
    return true;
  });
}

function contentWithOriginalNonTextParts(text, originalUser) {
  const extraParts = nonTextContentParts(originalUser?.content);
  return extraParts.length ? [{ type: "text", text }, ...extraParts] : text;
}

function nonTextContentParts(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((part) => {
    if (!part || typeof part !== "object") return false;
    if (part.type === "text" || typeof part.text === "string") return false;
    return true;
  });
}
