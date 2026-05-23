import { appendModeReminder } from "../input/mode-state.mjs";
import { inverse } from "../tui/ui-theme.mjs";
import { formatRecallHints } from "../../memory/markdown-store.mjs";
import { formatMessageAttachmentsForDisplay } from "../../session/attachment-display.mjs";
import { formatShellHints } from "../../shell/hints.mjs";

export function prepareTurnInput({ prompt, runner, memoryStore, currentProject, modeState = null }) {
  memoryStore.beginTurn();
  const engine = runner.engine ?? {};
  const carryoverAlreadyRendered = engine.hasRenderedPendingAssistantRecallHints?.() ?? false;
  const carryoverRecallHints = engine.takePendingAssistantRecallHints?.() ?? [];
  const userRecallHints = memoryStore.recallForUser(prompt, {
    currentProject,
    excludedIds: engine.getRecentRecallMemoryIds?.() ?? [],
  });
  const modePrompt = appendModeReminder(prompt, modeState?.get?.());
  const fullPrompt = appendPromptBlocks(
    modePrompt,
    formatRecallHints("user", userRecallHints),
    formatRecallHints("assistant", carryoverRecallHints),
    formatShellHints(runner.shellRuntime),
  );

  return {
    fullPrompt,
    userMessage: prompt,
    runOptions: { userRecallHints, currentProject },
    displayMessage: formatUserDisplayMessage(prompt),
    userRecallHints,
    carryoverRecallHints,
    shouldRenderCarryoverRecall: carryoverRecallHints.length > 0 && !carryoverAlreadyRendered,
  };
}

export function formatUserDisplayMessage(prompt) {
  return `${inverse(" USER ")} ${formatMessageAttachmentsForDisplay(prompt)}`;
}

function appendPromptBlocks(prompt, ...blocks) {
  return [prompt, ...blocks.filter(Boolean)].join("\n\n");
}
