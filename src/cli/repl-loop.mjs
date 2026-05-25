import { brightBlack } from "./tui/ui-theme.mjs";
import { handleSlashCommand } from "./slash-commands.mjs";
import { expandPromptTemplate } from "./input/prompt-templates.mjs";
import { parseInlineShellInput, runInlineShellCommand } from "./repl-commands.mjs";
import { prepareTurnInput } from "./turn/turn-input-preparer.mjs";
export { formatUserDisplayMessage } from "./turn/turn-input-preparer.mjs";

export async function runSingleShotPrompt({
  prompt,
  runner,
  memoryStore,
  currentProject,
  ui,
  refreshStatusBar,
  modeState = null,
}) {
  memoryStore.beginTurn();
  try {
    const turnInput = prepareTurnInput({ prompt, runner, memoryStore, currentProject, modeState });
    ui.writeln(turnInput.displayMessage);
    ui.recall?.({ source: "user", hints: turnInput.userRecallHints });
    if (turnInput.shouldRenderCarryoverRecall) ui.recall?.({ source: "assistant", hints: turnInput.carryoverRecallHints });
    refreshStatusBar.startWorking?.();
    const result = await runner.runTurn(turnInput.fullPrompt, turnInput.userMessage, turnInput.runOptions);
    renderPendingAssistantRecallPreview({ runner, ui });
    await handleTurnLifecycleAction(result?.lifecycleAction, { runner, ui });
  } finally {
    refreshStatusBar.stopWorking?.();
    memoryStore.endTurn();
  }
  refreshStatusBar();
}

export async function runInteractiveRepl({
  cwd,
  ui,
  runner,
  memoryStore,
  currentProject,
  currentProjectInfo = null,
  stateRoot = null,
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
      stateRoot,
      currentProjectId: currentProjectInfo?.projectId ?? null,
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

async function runReplTurn({ prompt, runner, memoryStore, currentProject, ui, refreshStatusBar, setTurnRunning, modeState = null }) {
  memoryStore.beginTurn();
  try {
    const turnInput = prepareTurnInput({ prompt, runner, memoryStore, currentProject, modeState });
    ui.writeln(turnInput.displayMessage);
    ui.recall?.({ source: "user", hints: turnInput.userRecallHints });
    if (turnInput.shouldRenderCarryoverRecall) ui.recall?.({ source: "assistant", hints: turnInput.carryoverRecallHints });
    setTurnRunning(true);
    refreshStatusBar.startWorking?.();
    const result = await runner.runTurn(turnInput.fullPrompt, turnInput.userMessage, turnInput.runOptions);
    renderPendingAssistantRecallPreview({ runner, ui });
    await handleTurnLifecycleAction(result?.lifecycleAction, { runner, ui });
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

async function handleTurnLifecycleAction(action, { runner, ui }) {
  if (action?.type !== "restart_runtime") return;
  if (typeof runner.restartRuntime !== "function") {
    ui.writeln("March runtime restart requested, but runtime reload is unavailable in in-process mode. Restart March to load code changes.");
    return;
  }
  await runner.restartRuntime();
  ui.writeln("● March runtime 已重启，下一轮将使用磁盘上的最新代码");
}

function renderPendingAssistantRecallPreview({ runner, ui }) {
  if (runner.engine.hasRenderedPendingAssistantRecallHints?.()) return;
  const hints = runner.engine.peekPendingAssistantRecallHints?.() ?? [];
  if (hints.length === 0) return;
  ui.recall?.({ source: "assistant", hints });
  runner.engine.markPendingAssistantRecallHintsRendered?.();
}
