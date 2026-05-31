import { resolveImageAttachmentReferences } from "../../session/attachment-references.mjs";
import { buildAssistantExecutionJson, buildUserRecallInput, closeAssistantReply, compactAssistantContext, createTurnEventState, handleRunnerSessionEvent } from "./turn-events.mjs";
import { buildInitialPiPrompt, resetPiMessageHistory } from "./pi-turn-context.mjs";

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
  syncCurrentMarchSessionState,
  autoNameSession,
  contextMode = "rebuild",
  recordHistory = null,
  setCurrentTurnState = null,
  flushFinalAssistantRecall = null,
}) {
  const {
    userRecallHints = [],
  } = options;
  const activeSession = sessionBinding.get();
  const turnState = createTurnEventState();
  setCurrentTurnState?.(turnState);
  ui.turnStart();
  setPhase?.("subscribed");
  logger?.event("turn.ui.start");

  const unsubscribe = activeSession.subscribe((event) => {
    logSessionEvent(logger, event);
    if (event.type === "tool_execution_start") {
      setPhase?.(`tool_running:${event.toolName ?? "unknown"}`);
    }
    if (event.type === "tool_execution_end") {
      setPhase?.("model_streaming");
    }
    if (event.type === "auto_retry_start") {
      setPhase?.("retry_wait");
    }
    if (event.type === "auto_retry_end") {
      setPhase?.("model_streaming");
    }
    if (event.type === "message_update") {
      setPhase?.("model_streaming");
    }
    handleRunnerSessionEvent(event, { ui, engine, state: turnState });
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
      const piPrompt = contextMode === "continueExistingPiTranscript"
        ? (userMessage ?? prompt)
        : buildInitialPiPrompt(engine, prompt);
      await activeSession.prompt(
        piPrompt,
        attachmentReferences.images.length > 0 ? { images: attachmentReferences.images } : undefined,
      );
      throwIfAssistantEndedWithError(turnState);
    } finally {
      setModelCallKind("model");
      logger?.event("model.prompt.end");
    }

    setPhase?.("finalizing");
    await finalizeTurn({
      prompt,
      userMessage,
      userRecallHints,
      memoryStore,
      engine,
      ui,
      turnState,
      syncCurrentMarchSessionState,
      autoNameSession,
      recordHistory,
      flushFinalAssistantRecall,
    });
    return { draft: turnState.draft };
  } finally {
    logger?.event("turn.ui.end");
    setCurrentTurnState?.(null);
    ui.turnEnd();
    unsubscribe();
  }
}

function throwIfAssistantEndedWithError(turnState) {
  if (turnState.lastAssistantStopReason !== "error") return;
  const error = new Error(turnState.lastAssistantErrorMessage || "Model provider returned an error");
  error.code = "MODEL_PROVIDER_ERROR";
  throw error;
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

async function finalizeTurn({ prompt, userMessage, userRecallHints, memoryStore, engine, ui, turnState, syncCurrentMarchSessionState, autoNameSession, recordHistory, flushFinalAssistantRecall }) {
  closeAssistantReply({ ui, state: turnState });
  const assistantRecall = await (flushFinalAssistantRecall?.(turnState) ?? flushAssistantRecall({ memoryStore, engine, turnState }));
  if (assistantRecall.report) ui.recall?.({ hints: assistantRecall.hints, report: assistantRecall.report, variant: "assistant" });

  const userRecallInput = buildUserRecallInput(userRecallHints);
  const turn = engine.recordTurn({
    userMessage: userMessage ?? prompt.slice(0, 300),
    assistantMessage: turnState.draft,
    assistantContext: compactAssistantContext(turnState),
    userRecallHints,
    userExecutionJson: userRecallInput ? {
      schemaVersion: 1,
      contextInputs: { turnStart: { userRecall: [userRecallInput] } },
    } : null,
    assistantExecutionJson: buildAssistantExecutionJson(turnState, { assistantRecall }),
  });
  recordHistory?.({ ...turn, thinking: assistantThinkingText(turnState), toolCalls: turnState.toolCalls });

  autoNameSession?.();
  syncCurrentMarchSessionState();
}

export async function flushAssistantRecall({ memoryStore, engine, turnState }) {
  if (!memoryStore) return { hints: [], report: null };
  const text = assistantRecallDeltaText(turnState);
  advanceAssistantRecallCursor(turnState);
  if (!text.trim()) return { hints: [], report: null };
  return await memoryStore.recallForAssistant(text, {
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
