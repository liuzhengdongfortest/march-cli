export async function preloadSemanticMemoryRecall({ memoryStore, ui = null, logger = null } = {}) {
  if (!memoryStore?.semanticRecall?.enabled) return { ok: true, skipped: true };
  try {
    ui?.status?.("Preparing memory recall model...");
    await memoryStore.semanticRecall.preload();
    memoryStore.semanticRecallWarning = memoryStore.semanticRecall.warning;
    if (memoryStore.semanticRecallWarning) ui?.writeln?.(`Memory recall fallback: ${memoryStore.semanticRecallWarning}`);
    logger?.event?.("memory.semantic_model_ready", { modelId: memoryStore.semanticRecall.modelId, status: memoryStore.semanticRecall.status });
    return { ok: true, skipped: false, fallback: memoryStore.semanticRecall.status === "fallback" };
  } catch (err) {
    const message = err?.message ?? String(err);
    memoryStore.semanticRecallWarning = message;
    logger?.error?.("memory.semantic_model_preload_failed", { error: message });
    ui?.writeln?.(`Memory recall model preload failed: ${message}`);
    return { ok: false, error: message };
  }
}
