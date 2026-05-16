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
}) {
  const { userRecallHints = [], currentProject = "" } = options;
  const activeSession = sessionBinding.get();
  const turnState = createTurnEventState();
  const midTurnRecallHints = [];
  ui.turnStart();

  const unsubscribe = activeSession.subscribe((event) => {
    handleRunnerSessionEvent(event, { ui, engine, state: turnState });
    if (event.type === "tool_execution_end") {
      const hints = recallForAssistantState({ memoryStore, engine, turnState, currentProject });
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
      resetPiMessageHistory(activeSession);
      await activeSession.prompt(
        prompt,
        attachmentReferences.images.length > 0 ? { images: attachmentReferences.images } : undefined,
      );
    } finally {
      setModelCallKind("model");
    }

    closeAssistantReply({ ui, state: turnState });
    const assistantRecallHints = recallForAssistantState({ memoryStore, engine, turnState, currentProject });
    ui.memoryHint?.({ source: "assistant", hints: assistantRecallHints });
    const recordedAssistantRecallHints = uniqueHints([...midTurnRecallHints, ...assistantRecallHints]);

    engine.recordTurn({
      userMessage: userMessage ?? prompt.slice(0, 300),
      assistantMessage: turnState.draft,
      userRecallHints,
      assistantRecallHints: recordedAssistantRecallHints,
    });

    syncCurrentPiSidecar();
    return { draft: turnState.draft };
  } finally {
    ui.turnEnd();
    unsubscribe();
  }
}

function recallForAssistantState({ memoryStore, engine, turnState, currentProject }) {
  if (!memoryStore) return [];
  return memoryStore.recallForAssistant(assistantRecallText(turnState), {
    currentProject,
    excludedIds: engine.getRecentRecallMemoryIds?.() ?? [],
  });
}

function assistantRecallText(turnState) {
  return [turnState.draft, turnState.thinkingAccumulator, turnState.thinkingText]
    .filter(Boolean)
    .join("\n");
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
