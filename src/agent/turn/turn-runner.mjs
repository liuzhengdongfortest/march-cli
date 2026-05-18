import { resolveImageAttachmentReferences } from "../../session/attachment-references.mjs";
import { closeAssistantReply, compactAssistantContext, createTurnEventState, handleRunnerSessionEvent } from "./turn-events.mjs";

export async function runRunnerTurn({
  prompt,
  userMessage,
  options = {},
  sessionBinding,
  engine,
  ui,
  projectMarchDir,
  memoryStore,
  setModelCallKind,
  logger = null,
  setPhase = null,
  onMidTurnRecallHints,
  syncCurrentPiSidecar,
  autoNameSession,
  contextMode = "rebuild",
}) {
  const {
    userRecallHints = [],
    currentProject = "",
  } = options;
  const activeSession = sessionBinding.get();
  const turnState = createTurnEventState();
  const midTurnRecallHints = [];
  ui.turnStart();
  setPhase?.("subscribed");
  logger?.event("turn.ui.start");

  const unsubscribe = activeSession.subscribe((event) => {
    logSessionEvent(logger, event);
    if (event.type === "tool_execution_start") setPhase?.(`tool_running:${event.toolName ?? "unknown"}`);
    if (event.type === "tool_execution_end") setPhase?.("model_streaming");
    if (event.type === "auto_retry_start") setPhase?.("retry_wait");
    if (event.type === "auto_retry_end") setPhase?.("model_streaming");
    if (event.type === "message_update") setPhase?.("model_streaming");
    handleRunnerSessionEvent(event, { ui, engine, state: turnState });
    if (event.type === "tool_execution_start") {
      const hints = flushAssistantRecall({ memoryStore, engine, turnState, currentProject });
      if (hints.length > 0) {
        midTurnRecallHints.push(...hints);
        onMidTurnRecallHints?.(hints);
        ui.memoryHint?.({ source: "assistant", hints });
      }
    }
  });

  try {
    const attachmentReferences = resolveImageAttachmentReferences({
      text: userMessage ?? prompt,
      projectMarchDir,
    });
    logger?.event("turn.attachments.resolved", { imageCount: attachmentReferences.images.length });
    setModelCallKind("user");
    setPhase?.("model_request");
    logger?.event("model.prompt.start", { contextMode });
    try {
      if (contextMode === "rebuild") resetPiMessageHistory(activeSession);
      await activeSession.prompt(
        contextMode === "continueExistingPiTranscript" ? (userMessage ?? prompt) : prompt,
        attachmentReferences.images.length > 0 ? { images: attachmentReferences.images } : undefined,
      );
    } finally {
      setModelCallKind("model");
      logger?.event("model.prompt.end");
    }

    setPhase?.("finalizing");
    finalizeTurn({
      prompt,
      userMessage,
      userRecallHints,
      currentProject,
      memoryStore,
      engine,
      ui,
      turnState,
      midTurnRecallHints,
      syncCurrentPiSidecar,
      autoNameSession,
    });
    return { draft: turnState.draft };
  } finally {
    logger?.event("turn.ui.end");
    ui.turnEnd();
    unsubscribe();
  }
}

function logSessionEvent(logger, event) {
  if (!logger) return;
  if (event.type === "message_update") {
    const messageEvent = event.assistantMessageEvent;
    logger.debug("session.event", {
      type: event.type,
      assistantMessageType: messageEvent?.type,
      deltaLength: messageEvent?.delta?.length,
    });
    return;
  }
  logger.event("session.event", {
    type: event.type,
    toolName: event.toolName,
    isError: event.isError,
    attempt: event.attempt,
    maxAttempts: event.maxAttempts,
    delayMs: event.delayMs,
    success: event.success,
    errorMessage: event.errorMessage,
    finalError: event.finalError,
  });
}

function finalizeTurn({ prompt, userMessage, userRecallHints, currentProject, memoryStore, engine, ui, turnState, midTurnRecallHints, syncCurrentPiSidecar, autoNameSession }) {
  closeAssistantReply({ ui, state: turnState });
  const assistantRecallHints = flushAssistantRecall({ memoryStore, engine, turnState, currentProject });
  engine.setPendingAssistantRecallHints?.(assistantRecallHints);
  const recordedAssistantRecallHints = uniqueHints([...midTurnRecallHints, ...assistantRecallHints]);

  engine.recordTurn({
    userMessage: userMessage ?? prompt.slice(0, 300),
    assistantMessage: turnState.draft,
    assistantContext: compactAssistantContext(turnState),
    userRecallHints,
    assistantRecallHints: recordedAssistantRecallHints,
  });

  autoNameSession?.();
  syncCurrentPiSidecar();
}

function flushAssistantRecall({ memoryStore, engine, turnState, currentProject }) {
  if (!memoryStore) return [];
  const text = assistantRecallDeltaText(turnState);
  advanceAssistantRecallCursor(turnState);
  if (!text.trim()) return [];
  return memoryStore.recallForAssistant(text, {
    currentProject,
    excludedIds: engine.getRecentRecallMemoryIds?.() ?? [],
  });
}

function assistantRecallDeltaText(turnState) {
  const cursor = turnState.recallCursor ?? { draftLength: 0, thinkingLength: 0 };
  const thinking = assistantThinkingText(turnState);
  return [
    turnState.draft.slice(cursor.draftLength),
    thinking.slice(cursor.thinkingLength),
  ]
    .filter(Boolean)
    .join("\n");
}

function advanceAssistantRecallCursor(turnState) {
  turnState.recallCursor = {
    draftLength: turnState.draft.length,
    thinkingLength: assistantThinkingText(turnState).length,
  };
}

function assistantThinkingText(turnState) {
  return `${turnState.thinkingAccumulator}${turnState.thinkingText}`;
}

function uniqueHints(hints) {
  const seen = new Set();
  const unique = [];
  for (const hint of hints) {
    if (!hint?.id || seen.has(hint.id)) continue;
    seen.add(hint.id);
    unique.push(hint);
  }
  return unique;
}

function resetPiMessageHistory(session) {
  if (Array.isArray(session?.agent?.state?.messages)) {
    session.agent.state.messages = [];
  }
}
