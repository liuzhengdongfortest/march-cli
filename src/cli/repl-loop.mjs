import { brightBlack, inverse } from "./tui/ui-theme.mjs";
import { handleSlashCommand } from "./slash-commands.mjs";
import { appendModeReminder } from "./input/mode-state.mjs";
import { expandPromptTemplate } from "./input/prompt-templates.mjs";
import { parseInlineShellInput, runInlineShellCommand } from "./repl-commands.mjs";
import { formatRecallHints } from "../memory/markdown-store.mjs";
import { formatMessageAttachmentsForDisplay } from "../session/attachment-display.mjs";
import { formatShellHints } from "../shell/hints.mjs";

export async function runSingleShotPrompt({
  prompt,
  runner,
  memoryStore,
  currentProject,
  ui,
  sessionState,
  refreshStatusBar,
  modeState = null,
}) {
  memoryStore.beginTurn();
  const carryoverAlreadyRendered = runner.engine.hasRenderedPendingAssistantRecallHints?.() ?? false;
  const carryoverRecallHints = runner.engine.takePendingAssistantRecallHints?.() ?? [];
  const userRecallHints = memoryStore.recallForUser(prompt, { currentProject, excludedIds: runner.engine.getRecentRecallMemoryIds?.() ?? [] });
  const recallBlock = formatRecallHints("user", userRecallHints);
  const carryoverRecallBlock = formatRecallHints("assistant", carryoverRecallHints);
  const shellHints = formatShellHints(runner.shellRuntime);
  const modePrompt = appendModeReminder(prompt, modeState?.get?.());
  const fullPrompt = appendPromptBlocks(modePrompt, recallBlock, carryoverRecallBlock, shellHints);
  ui.writeln(formatUserDisplayMessage(prompt));
  ui.recall?.({ source: "user", hints: userRecallHints });
  if (carryoverRecallHints.length > 0 && !carryoverAlreadyRendered) ui.recall?.({ source: "assistant", hints: carryoverRecallHints });
  refreshStatusBar.startWorking?.();
  try {
    await runner.runTurn(fullPrompt, prompt, { userRecallHints, currentProject });
    renderPendingAssistantRecallPreview({ runner, ui });
  } finally {
    refreshStatusBar.stopWorking?.();
    memoryStore.endTurn();
  }
  refreshStatusBar();
}

export async function runInteractiveRepl({
  cwd,
  args,
  ui,
  runner,
  memoryStore,
  currentProject,
  sessionState,
  sessionsRoot,
  projectMarchDir,
  sessionSource,
  extensionPaths,
  keybindingConfig,
  promptTemplateConfig,
  renderStartupBanner = null,
  refreshStatusBar,
  setTurnRunning,
  modeState = null,
  configHomeDir,
}) {
  let lastInlineShellCommand = "";

  for (;;) {
    const line = await ui.readline("> ");
    if (line === null) break;
    let trimmed = line.trim();
    if (!trimmed) continue;

    const handledInline = handleInlineCommand(trimmed, { cwd, ui, lastInlineShellCommand });
    if (handledInline.type === "handled") {
      lastInlineShellCommand = handledInline.lastInlineShellCommand;
      continue;
    }
    if (handledInline.type === "error") continue;

    const slashResult = await handleSlashCommand(trimmed, {
      ui,
      runner,
      sessionState,
      sessionsRoot,
      projectMarchDir,
      sessionSource,
      extensionPaths,
      keybindings: keybindingConfig.keybindings,
      keybindingDiagnostics: keybindingConfig.diagnostics,
      promptTemplates: promptTemplateConfig.templates,
      promptTemplateDiagnostics: promptTemplateConfig.diagnostics,
      modeState,
      renderStartupBanner,
      configHomeDir,
    });
    if (slashResult.exit) break;
    if (slashResult.handled) {
      refreshStatusBar(contextTokenRefreshOptions(slashResult, runner));
      continue;
    }

    const templateResult = expandPromptTemplate(trimmed, promptTemplateConfig.templates);
    if (templateResult.type === "template") {
      ui.writeln(brightBlack(`● template: ${templateResult.name}`));
      trimmed = templateResult.prompt;
    }

    await runReplTurn({
      prompt: trimmed,
      args,
      runner,
      memoryStore,
      currentProject,
      ui,
      refreshStatusBar,
      setTurnRunning,
      modeState,
    });
  }
}

export function contextTokenRefreshOptions(slashResult, runner) {
  if (!slashResult?.refreshContextTokens) return undefined;
  if (typeof runner.estimateContextTokens !== "function") return undefined;
  const contextTokens = runner.estimateContextTokens("");
  if (contextTokens && typeof contextTokens.then === "function") return undefined;
  return { contextTokens };
}

function handleInlineCommand(trimmed, { cwd, ui, lastInlineShellCommand }) {
  const inlineShell = parseInlineShellInput(trimmed, lastInlineShellCommand);
  if (inlineShell.type === "error") {
    ui.writeln(`Error: ${inlineShell.message}`);
    return { type: "error" };
  }
  if (inlineShell.type === "command") {
    runInlineShellCommand(inlineShell.command, { cwd, ui });
    return { type: "handled", lastInlineShellCommand: inlineShell.command };
  }
  return { type: "none" };
}

async function runReplTurn({ prompt, args, runner, memoryStore, currentProject, ui, refreshStatusBar, setTurnRunning, modeState = null }) {
  memoryStore.beginTurn();
  const carryoverAlreadyRendered = runner.engine.hasRenderedPendingAssistantRecallHints?.() ?? false;
  const carryoverRecallHints = runner.engine.takePendingAssistantRecallHints?.() ?? [];
  const userRecallHints = memoryStore.recallForUser(prompt, { currentProject, excludedIds: runner.engine.getRecentRecallMemoryIds?.() ?? [] });
  const recallBlock = formatRecallHints("user", userRecallHints);
  const carryoverRecallBlock = formatRecallHints("assistant", carryoverRecallHints);
  const shellHints = formatShellHints(runner.shellRuntime);
  const modePrompt = appendModeReminder(prompt, modeState?.get?.());
  const fullPrompt = appendPromptBlocks(modePrompt, recallBlock, carryoverRecallBlock, shellHints);
  try {
    ui.writeln(formatUserDisplayMessage(prompt));
    ui.recall?.({ source: "user", hints: userRecallHints });
    if (carryoverRecallHints.length > 0 && !carryoverAlreadyRendered) ui.recall?.({ source: "assistant", hints: carryoverRecallHints });
    setTurnRunning(true);
    refreshStatusBar.startWorking?.();
    await runner.runTurn(fullPrompt, prompt, { userRecallHints, currentProject });
    renderPendingAssistantRecallPreview({ runner, ui });
    ui.writeln("");
  } catch (err) {
    ui.writeln(`Error: ${err.message}`);
  } finally {
    setTurnRunning(false);
    refreshStatusBar.stopWorking?.();
    memoryStore.endTurn();
    refreshStatusBar();
  }
}

export function formatUserDisplayMessage(prompt) {
  return `${inverse(" USER ")} ${formatMessageAttachmentsForDisplay(prompt)}`;
}

function appendPromptBlocks(prompt, ...blocks) {
  return [prompt, ...blocks.filter(Boolean)].join("\n\n");
}

function renderPendingAssistantRecallPreview({ runner, ui }) {
  if (runner.engine.hasRenderedPendingAssistantRecallHints?.()) return;
  const hints = runner.engine.peekPendingAssistantRecallHints?.() ?? [];
  if (hints.length === 0) return;
  ui.recall?.({ source: "assistant", hints });
  runner.engine.markPendingAssistantRecallHintsRendered?.();
}
