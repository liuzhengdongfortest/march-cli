import { resolveImageAttachmentReferences } from "../../session/attachment-references.mjs";
import { closeAssistantReply, createTurnEventState, handleRunnerSessionEvent } from "./turn-events.mjs";

export function isModelStreamIdleTimeoutError(err) {
  return err?.code === "MODEL_STREAM_IDLE_TIMEOUT";
}

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
  onMidTurnRecallHints,
  syncCurrentPiSidecar,
  autoNameSession,
  contextMode = "rebuild",
}) {
  const {
    userRecallHints = [],
    currentProject = "",
    modelStreamIdleTimeoutMs = 7000,
    modelStreamIdleMaxRetries = 5,
  } = options;
  const activeSession = sessionBinding.get();
  const turnState = createTurnEventState();
  const midTurnRecallHints = [];
  const modelIdleWatchdog = createModelStreamIdleWatchdog({
    session: activeSession,
    ui,
    timeoutMs: modelStreamIdleTimeoutMs,
  });
  ui.turnStart();

  const unsubscribe = activeSession.subscribe((event) => {
    modelIdleWatchdog.handleEvent(event);
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
    setModelCallKind("user");
    try {
      await promptWithModelIdleRetry({
        session: activeSession,
        prompt: contextMode === "continueExistingPiTranscript" ? (userMessage ?? prompt) : prompt,
        promptOptions: attachmentReferences.images.length > 0 ? { images: attachmentReferences.images } : undefined,
        resetBeforeAttempt: contextMode === "rebuild",
        maxRetries: modelStreamIdleMaxRetries,
        watchdog: modelIdleWatchdog,
      });
    } catch (err) {
      if (!isModelStreamIdleTimeoutError(err)) throw err;
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
      throw err;
    } finally {
      modelIdleWatchdog.stop();
      setModelCallKind("model");
    }

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
    ui.turnEnd();
    unsubscribe();
  }
}

async function promptWithModelIdleRetry({ session, prompt, promptOptions, resetBeforeAttempt, maxRetries, watchdog }) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    if (resetBeforeAttempt) resetPiMessageHistory(session);
    const messageHistorySnapshot = clonePiMessageHistory(session);
    watchdog.startAttempt({ attempt, maxAttempts: maxRetries + 1 });
    let idleTimedOut = false;
    try {
      await session.prompt(prompt, promptOptions);
      idleTimedOut = watchdog.consumeTimedOut();
      if (!idleTimedOut) {
        if (attempt > 1) watchdog.reportRecovered({ attempt: attempt - 1 });
        return;
      }
    } catch (err) {
      idleTimedOut = watchdog.consumeTimedOut();
      if (!idleTimedOut) throw err;
    } finally {
      watchdog.stop();
    }

    if (attempt > maxRetries) {
      const err = createModelStreamIdleTimeoutError(watchdog.timeoutMs);
      watchdog.reportExhausted({ attempt, error: err });
      throw err;
    }
    restorePiMessageHistory(session, messageHistorySnapshot);
    watchdog.reportRetry({ attempt, maxAttempts: maxRetries + 1 });
  }
}

function finalizeTurn({ prompt, userMessage, userRecallHints, currentProject, memoryStore, engine, ui, turnState, midTurnRecallHints, syncCurrentPiSidecar, autoNameSession }) {
  closeAssistantReply({ ui, state: turnState });
  const assistantRecallHints = flushAssistantRecall({ memoryStore, engine, turnState, currentProject });
  engine.setPendingAssistantRecallHints?.(assistantRecallHints);
  const recordedAssistantRecallHints = uniqueHints([...midTurnRecallHints, ...assistantRecallHints]);

  engine.recordTurn({
    userMessage: userMessage ?? prompt.slice(0, 300),
    assistantMessage: turnState.draft,
    userRecallHints,
    assistantRecallHints: recordedAssistantRecallHints,
  });

  autoNameSession?.();
  syncCurrentPiSidecar();
}

function createModelStreamIdleTimeoutError(timeoutMs) {
  const err = new Error(`Model stream idle for ${timeoutMs}ms`);
  err.code = "MODEL_STREAM_IDLE_TIMEOUT";
  return err;
}

function createModelStreamIdleWatchdog({ session, ui, timeoutMs }) {
  let timer = null;
  let active = false;
  let inTool = false;
  let timedOut = false;

  return {
    timeoutMs,
    startAttempt() {
      timedOut = false;
      inTool = false;
      active = true;
      arm();
    },
    handleEvent(event) {
      if (!active || timedOut) return;
      if (event.type === "tool_execution_start") {
        inTool = true;
        clear();
        return;
      }
      if (event.type === "tool_execution_end") {
        inTool = false;
        arm();
        return;
      }
      if (event.type === "message_update") arm();
    },
    stop() {
      active = false;
      clear();
    },
    consumeTimedOut() {
      const value = timedOut;
      timedOut = false;
      return value;
    },
    reportRetry({ attempt, maxAttempts }) {
      ui.retryStart?.({
        attempt,
        maxAttempts,
        delayMs: 0,
        errorMessage: `Model stream idle for ${timeoutMs}ms; retrying request`,
      });
    },
    reportRecovered({ attempt }) {
      ui.retryEnd?.({ success: true, attempt });
    },
    reportExhausted({ attempt, error }) {
      ui.retryEnd?.({ success: false, attempt, finalError: error.message });
    },
  };

  function arm() {
    clear();
    if (!active || inTool || timeoutMs <= 0) return;
    timer = setTimeout(() => {
      timedOut = true;
      active = false;
      clear();
      session.abortRetry?.();
      session.abort();
    }, timeoutMs);
  }

  function clear() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }
}

function clonePiMessageHistory(session) {
  const messages = session?.agent?.state?.messages;
  if (!Array.isArray(messages)) return null;
  return JSON.parse(JSON.stringify(messages));
}

function restorePiMessageHistory(session, messages) {
  if (!Array.isArray(session?.agent?.state?.messages) || !Array.isArray(messages)) return;
  session.agent.state.messages = JSON.parse(JSON.stringify(messages));
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
