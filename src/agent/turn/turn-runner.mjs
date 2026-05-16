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
  syncCurrentPiSidecar,
}) {
  const { userRecallHints = [], currentProject = "" } = options;
  const activeSession = sessionBinding.get();
  const turnState = createTurnEventState();
  ui.turnStart();

  const unsubscribe = activeSession.subscribe((event) => {
    handleRunnerSessionEvent(event, { ui, engine, state: turnState });
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
    const assistantRecallHints = memoryStore
      ? memoryStore.recallForAssistant(turnState.draft, { currentProject, excludedIds: engine.getRecentRecallMemoryIds?.() ?? [] })
      : [];
    ui.passiveRecall?.({ source: "assistant", hints: assistantRecallHints });

    engine.recordTurn({
      userMessage: userMessage ?? prompt.slice(0, 300),
      assistantMessage: turnState.draft,
      userRecallHints,
      assistantRecallHints,
    });

    syncCurrentPiSidecar();
    return { draft: turnState.draft };
  } finally {
    ui.turnEnd();
    unsubscribe();
  }
}

function resetPiMessageHistory(session) {
  if (Array.isArray(session?.agent?.state?.messages)) {
    session.agent.state.messages = [];
  }
}
