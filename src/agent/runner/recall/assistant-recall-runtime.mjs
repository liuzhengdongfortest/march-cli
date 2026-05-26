export function createAssistantRecallRuntime({ memoryStore, engine }) {
  let cursor = null;
  return {
    reset() { cursor = null; },
    getCursor() { return cursor; },
    setCursor(value) { cursor = value; },
    recallText(text) { return recallForAssistantText({ memoryStore, engine, text }); },
    flushFinal(turnState) {
      const fullText = [assistantThinkingText(turnState), turnState?.draft ?? ""].filter(Boolean).join("\n");
      const previous = cursor;
      cursor = fullText.length;
      const text = previous == null ? fullText.trim() : fullText.slice(previous).trim();
      return recallForAssistantText({ memoryStore, engine, text });
    },
  };
}

async function recallForAssistantText({ memoryStore, engine, text }) {
  if (!memoryStore || !String(text ?? "").trim()) return { hints: [], report: null };
  return await memoryStore.recallForAssistant(String(text), {
    excludedIds: engine.getRecentRecallMemoryIds?.() ?? [],
  });
}

function assistantThinkingText(turnState) {
  return `${turnState?.thinkingAccumulator ?? ""}${turnState?.thinkingText ?? ""}`;
}
