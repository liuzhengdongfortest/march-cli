import { resolveImageAttachmentReferences } from "../../session/attachment-references.mjs";
import { closeAssistantReply, createTurnEventState, handleRunnerSessionEvent } from "./turn-events.mjs";

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
  const { userRecallHints = [], currentProject = "" } = options;
  const activeSession = sessionBinding.get();
  const turnState = createTurnEventState();
  const midTurnRecallHints = [];
  ui.turnStart();

  const unsubscribe = activeSession.subscribe((event) => {
    handleRunnerSessionEvent(event, { ui, engine, state: turnState });
    if (event.type === "tool_execution_start") {
      const hints = flushAssistantRecall({ memoryStore, engine, turnState, currentProject });
      if (hints.length > 0) {
        midTurnRecallHints.push(...hints);
        onMidTurnRecallHints?.(hints);
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
      if (contextMode === "rebuild") resetPiMessageHistory(activeSession);
      await activeSession.prompt(
        contextMode === "continueExistingPiTranscript" ? (userMessage ?? prompt) : prompt,
        attachmentReferences.images.length > 0 ? { images: attachmentReferences.images } : undefined,
      );
    } finally {
      setModelCallKind("model");
    }

    closeAssistantReply({ ui, state: turnState });
    const assistantRecallHints = flushAssistantRecall({ memoryStore, engine, turnState, currentProject });
    const recordedAssistantRecallHints = uniqueHints([...midTurnRecallHints, ...assistantRecallHints]);
    ui.memoryHint?.({ source: "assistant", hints: recordedAssistantRecallHints });

    engine.recordTurn({
      userMessage: userMessage ?? prompt.slice(0, 300),
      assistantMessage: turnState.draft,
      userRecallHints,
      assistantRecallHints: recordedAssistantRecallHints,
    });

    autoNameSession?.();
    syncCurrentPiSidecar();
    return { draft: turnState.draft };
  } finally {
    ui.turnEnd();
    unsubscribe();
  }
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
