import { formatRecallHints } from "../../memory/markdown-store.mjs";
import { resolveImageAttachmentReferences } from "../../session/attachment-references.mjs";
import { closeAssistantReply, compactAssistantContext, createTurnEventState, handleRunnerSessionEvent } from "./turn-events.mjs";

export const MODEL_STREAM_IDLE_TIMEOUT_CODE = "MODEL_STREAM_IDLE_TIMEOUT";

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
}) {
  const {
    userRecallHints = [],
    currentProject = "",
  } = options;
  const activeSession = sessionBinding.get();
  const turnState = createTurnEventState();
  const midTurnRecallHints = [];
  const idleWatchdog = createModelStreamIdleWatchdog({ session: activeSession, logger, setPhase });
  ui.turnStart();
  setPhase?.("subscribed");
  logger?.event("turn.ui.start");

  const unsubscribe = activeSession.subscribe((event) => {
    logSessionEvent(logger, event);
    if (event.type === "tool_execution_start") {
      idleWatchdog.pause();
      setPhase?.(`tool_running:${event.toolName ?? "unknown"}`);
    }
    if (event.type === "tool_execution_end") {
      setPhase?.("model_streaming");
      idleWatchdog.arm("tool_execution_end");
    }
    if (event.type === "auto_retry_start") {
      idleWatchdog.pause();
      setPhase?.("retry_wait");
    }
    if (event.type === "auto_retry_end") {
      setPhase?.("model_streaming");
      idleWatchdog.arm("auto_retry_end");
    }
    if (event.type === "message_update") {
      setPhase?.("model_streaming");
      idleWatchdog.arm("message_update");
    }
    handleRunnerSessionEvent(event, { ui, engine, state: turnState });
    if (event.type === "tool_execution_start") {
      const hints = flushAssistantRecall({ memoryStore, engine, turnState, currentProject });
      if (hints.length > 0) {
        midTurnRecallHints.push(...hints);
        queueMidTurnRecallHints(activeSession, hints, logger);
        ui.recall?.({ source: "assistant", hints });
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
      idleWatchdog.arm("model_request");
      await idleWatchdog.watch(activeSession.prompt(
        contextMode === "continueExistingPiTranscript" ? (userMessage ?? prompt) : prompt,
        attachmentReferences.images.length > 0 ? { images: attachmentReferences.images } : undefined,
      ));
    } finally {
      idleWatchdog.clear();
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
      syncCurrentMarchSessionState,
      autoNameSession,
      recordHistory,
    });
    return { draft: turnState.draft };
  } finally {
    logger?.event("turn.ui.end");
    idleWatchdog.clear();
    ui.turnEnd();
    unsubscribe();
  }
}

function createModelStreamIdleWatchdog({ session, logger, setPhase }) {
  const timeoutMs = getModelStreamIdleTimeoutMs();
  let timer = null;
  let timedOut = false;
  let rejectIdle = null;
  const idlePromise = new Promise((_, reject) => {
    rejectIdle = reject;
  });

  return {
    arm(reason) {
      if (timeoutMs <= 0 || timedOut) return;
      clearTimer();
      timer = setTimeout(() => {
        timedOut = true;
        setPhase?.("model_idle_timeout");
        logger?.event("model.stream.idle_timeout", { timeoutMs, reason });
        try { session.abortRetry?.(); } catch {}
        try { session.abort?.(); } catch {}
        rejectIdle(createModelStreamIdleTimeoutError(timeoutMs, reason));
      }, timeoutMs);
    },
    pause: clearTimer,
    clear: clearTimer,
    async watch(promise) {
      const guarded = Promise.resolve(promise);
      guarded.catch(() => {});
      return await Promise.race([guarded, idlePromise]);
    },
  };

  function clearTimer() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }
}

function createModelStreamIdleTimeoutError(timeoutMs, reason) {
  const error = new Error(`Model stream idle timeout after ${timeoutMs}ms (${reason}); aborted the current turn`);
  error.code = MODEL_STREAM_IDLE_TIMEOUT_CODE;
  return error;
}

function getModelStreamIdleTimeoutMs() {
  const raw = process.env.MARCH_MODEL_STREAM_IDLE_TIMEOUT_MS;
  if (raw === "0" || raw === "false" || raw === "no") return 0;
  const parsed = raw ? Number.parseInt(raw, 10) : 180000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 180000;
}

function queueMidTurnRecallHints(session, hints, logger) {
  const content = formatRecallHints("assistant", hints);
  if (!content) return;
  const injected = session.sendCustomMessage?.({
    customType: "march.recall",
    content,
    display: false,
    details: { source: "assistant" },
  }, { deliverAs: "steer" });
  void injected?.catch?.((err) => {
    logger?.debug("memory.mid_turn_recall.inject_failed", { errorMessage: err?.message ?? String(err) });
  });
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

function finalizeTurn({ prompt, userMessage, userRecallHints, currentProject, memoryStore, engine, ui, turnState, midTurnRecallHints, syncCurrentMarchSessionState, autoNameSession, recordHistory }) {
  closeAssistantReply({ ui, state: turnState });
  const assistantRecallHints = flushAssistantRecall({ memoryStore, engine, turnState, currentProject });
  engine.setPendingAssistantRecallHints?.(assistantRecallHints);
  const recordedAssistantRecallHints = uniqueHints([...midTurnRecallHints, ...assistantRecallHints]);

  const turn = engine.recordTurn({
    userMessage: userMessage ?? prompt.slice(0, 300),
    assistantMessage: turnState.draft,
    assistantContext: compactAssistantContext(turnState),
    userRecallHints,
    assistantRecallHints: recordedAssistantRecallHints,
  });
  recordHistory?.({ ...turn, thinking: assistantThinkingText(turnState), toolCalls: turnState.toolCalls });

  autoNameSession?.();
  syncCurrentMarchSessionState();
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
