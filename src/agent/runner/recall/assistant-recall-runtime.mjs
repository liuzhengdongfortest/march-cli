export function createAssistantRecallRuntime({ memoryStore, engine }) {
  let buffer = "";
  let thinkingText = "";
  return {
    reset() {
      buffer = "";
      thinkingText = "";
    },
    observe(event) {
      if (!event) return;
      if (event.type === "text_delta") append(event.delta);
      if (event.type === "thinking_start") thinkingText = "";
      if (event.type === "thinking_delta") {
        thinkingText += event.delta ?? "";
        append(event.delta);
      }
      if (event.type === "thinking_end") {
        const full = typeof event.content === "string" ? event.content : "";
        if (full && full !== thinkingText) append(full.startsWith(thinkingText) ? full.slice(thinkingText.length) : full);
        thinkingText = "";
      }
    },
    flushForContext() {
      return recallForAssistantText({ memoryStore, engine, text: consume() });
    },
    flushFinal() {
      return recallForAssistantText({ memoryStore, engine, text: consume() });
    },
  };

  function append(text) {
    if (text) buffer += text;
  }

  function consume() {
    const text = buffer.trim();
    buffer = "";
    return text;
  }
}

async function recallForAssistantText({ memoryStore, engine, text }) {
  if (!memoryStore || !String(text ?? "").trim()) return { hints: [], report: null };
  return await memoryStore.recallForAssistant(String(text), {
    excludedIds: engine.getRecentRecallMemoryIds?.() ?? [],
  });
}
