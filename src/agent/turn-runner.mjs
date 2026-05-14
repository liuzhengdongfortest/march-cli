import { resolveImageAttachmentReferences } from "../session/attachment-references.mjs";
import { createTurnEventState, handleRunnerSessionEvent } from "./turn-events.mjs";

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
      await activeSession.prompt(
        prompt,
        attachmentReferences.images.length > 0 ? { images: attachmentReferences.images } : undefined,
      );
    } finally {
      setModelCallKind("model");
    }

    turnState.summarizing = true;
    ui.summaryStart();

    const originalTools = activeSession.getActiveToolNames();
    const originalThinking = activeSession.thinkingLevel;
    activeSession.setActiveToolsByName([]);
    activeSession.setThinkingLevel("off");

    try {
      setModelCallKind("summary");
      try {
        await activeSession.prompt(createSummaryPrompt());
      } finally {
        setModelCallKind("model");
      }
    } catch {
      if (!turnState.summaryDraft) {
        turnState.summaryDraft = turnState.draft.slice(0, 300) || "(no output)";
      }
    }

    activeSession.setActiveToolsByName(originalTools);
    activeSession.setThinkingLevel(originalThinking);
    ui.summaryDone();

    const summary = (turnState.summaryDraft || "(no summary)").slice(0, 4000);
    const assistantRecallHints = memoryStore
      ? memoryStore.recallForAssistant(turnState.draft, { currentProject })
      : [];

    engine.recordTurn({
      userMessage: userMessage ?? prompt.slice(0, 300),
      summary,
      assistantMessage: turnState.draft,
      userRecallHints,
      assistantRecallHints,
    });

    syncCurrentPiSidecar();
    return { draft: turnState.draft, summary };
  } finally {
    ui.turnEnd();
    unsubscribe();
  }
}

function createSummaryPrompt() {
  return "[system]\nSummarize the work you just completed in 1-2 paragraphs for the next turn's context. " +
    "Focus on: what was accomplished, what decisions were made, and what's left to do. " +
    "Output ONLY the summary — no tools, no code, just the summary text.\n\n" +
    "Keep it under 1k tokens.";
}
