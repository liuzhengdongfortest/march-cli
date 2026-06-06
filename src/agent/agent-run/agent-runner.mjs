import { resolveImageAttachmentReferences } from "../../session/attachment-references.mjs";
import { buildAssistantExecutionJson, buildUserRecallInput, closeAssistantReply, createAgentRunEventState, handleRunnerSessionEvent } from "./agent-run-events.mjs";
import { buildInitialPiPrompt, resetPiMessageHistory } from "./pi-agent-run-context.mjs";

export async function runAgentRun({
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
  setCurrentAgentRunState = null,
  flushFinalAssistantRecall = null,
}) {
  const {
    userRecallHints = [],
  } = options;
  const activeSession = sessionBinding.get();
  const agentRunState = createAgentRunEventState();
  setCurrentAgentRunState?.(agentRunState);
  ui.turnStart();
  setPhase?.("subscribed");
  logger?.event("agent_run.ui.start");

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
    handleRunnerSessionEvent(event, { ui, engine, state: agentRunState });
  });

  try {
    const attachmentReferences = resolveImageAttachmentReferences({
      text: userMessage ?? prompt,
      projectMarchDir,
    });
    logger?.event("agent_run.attachments.resolved", { imageCount: attachmentReferences.images.length });
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
      throwIfAssistantEndedWithError(agentRunState);
    } finally {
      setModelCallKind("model");
      logger?.event("model.prompt.end");
    }

    setPhase?.("finalizing");
    await finalizeAgentRun({
      prompt,
      userMessage,
      userRecallHints,
      memoryStore,
      engine,
      ui,
      agentRunState,
      syncCurrentMarchSessionState,
      autoNameSession,
      recordHistory,
      flushFinalAssistantRecall,
    });
    return { draft: agentRunState.draft };
  } finally {
    logger?.event("agent_run.ui.end");
    setCurrentAgentRunState?.(null);
    ui.turnEnd();
    unsubscribe();
  }
}

function throwIfAssistantEndedWithError(agentRunState) {
  if (agentRunState.lastAssistantStopReason !== "error") return;
  const error = new Error(agentRunState.lastAssistantErrorMessage || "Model provider returned an error");
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

async function finalizeAgentRun({ prompt, userMessage, userRecallHints, memoryStore, engine, ui, agentRunState, syncCurrentMarchSessionState, autoNameSession, recordHistory, flushFinalAssistantRecall }) {
  closeAssistantReply({ ui, state: agentRunState });
  const assistantRecall = await (flushFinalAssistantRecall?.(agentRunState) ?? flushAssistantRecall({ memoryStore, engine, agentRunState }));
  if (assistantRecall.report) ui.recall?.({ hints: assistantRecall.hints, report: assistantRecall.report, variant: "assistant" });

  const userRecallInput = buildUserRecallInput(userRecallHints);
  const turn = engine.recordTurn({
    userMessage: userMessage ?? prompt.slice(0, 300),
    assistantMessage: agentRunState.draft,
    userExecutionJson: userRecallInput ? {
      schemaVersion: 1,
      contextInputs: { turnStart: { userRecall: [userRecallInput] } },
    } : null,
    assistantExecutionJson: buildAssistantExecutionJson(agentRunState, { assistantRecall }),
  });
  recordHistory?.({ ...turn, thinking: assistantThinkingText(agentRunState), toolCalls: agentRunState.toolCalls });

  autoNameSession?.();
  syncCurrentMarchSessionState();
}

export async function flushAssistantRecall({ memoryStore, engine, agentRunState }) {
  if (!memoryStore) return { hints: [], report: null };
  const text = assistantRecallDeltaText(agentRunState);
  advanceAssistantRecallCursor(agentRunState);
  if (!text.trim()) return { hints: [], report: null };
  return await memoryStore.recallForAssistant(text, {
    excludedIds: engine.getRecentRecallMemoryIds?.() ?? [],
  });
}

function assistantRecallDeltaText(agentRunState) {
  const cursor = agentRunState.recallCursor ?? { draftLength: 0, thinkingLength: 0 };
  const thinking = assistantThinkingText(agentRunState);
  return [
    agentRunState.draft.slice(cursor.draftLength),
    thinking.slice(cursor.thinkingLength),
  ]
    .filter(Boolean)
    .join("\n");
}

function advanceAssistantRecallCursor(agentRunState) {
  agentRunState.recallCursor = {
    draftLength: agentRunState.draft.length,
    thinkingLength: assistantThinkingText(agentRunState).length,
  };
}

function assistantThinkingText(agentRunState) {
  return `${agentRunState.thinkingAccumulator}${agentRunState.thinkingText}`;
}
