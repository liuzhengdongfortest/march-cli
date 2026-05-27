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
  refreshStatusBar.startWorking?.();
  try {
    const turnInput = await prepareTurnInput({ prompt, runner, memoryStore, currentProject, modeState });
    ui.writeln(turnInput.displayMessage);
    ui.recall?.({ hints: turnInput.userRecallHints, report: turnInput.userRecallReport });
    const result = await runner.runTurn(turnInput.fullPrompt, turnInput.userMessage, turnInput.runOptions);
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
  workspaceSupervisor = null,
  workspaceOutputRouter = null,
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

    const active = getActiveRuntime({ workspaceSupervisor, cwd, runner, memoryStore, currentProject, currentProjectInfo, sessionState, sessionsRoot, projectMarchDir, extensionPaths, keybindingConfig, promptTemplateConfig });
    const handledInline = handleInlineCommand(trimmed, { cwd: active.cwd, ui, lastInlineShellCommand });
    if (handledInline.type === "handled") {
      lastInlineShellCommand = handledInline.lastInlineShellCommand;
      continue;
    }
    if (handledInline.type === "error") continue;

    const slashResult = await handleSlashCommand(trimmed, {
      ui,
      runner: active.runner,
      workspaceSupervisor,
      workspaceOutputRouter,
      sessionState: active.sessionState,
      sessionsRoot: active.sessionsRoot,
      projectMarchDir: active.projectMarchDir,
      sessionSource,
      extensionPaths: active.extensionPaths,
      keybindings: active.keybindingConfig.keybindings,
      keybindingDiagnostics: active.keybindingConfig.diagnostics,
      promptTemplates: active.promptTemplateConfig.templates,
      promptTemplateDiagnostics: active.promptTemplateConfig.diagnostics,
      modeState,
      renderStartupBanner,
      configHomeDir,
      stateRoot,
      currentProjectId: active.project?.projectId ?? null,
    });
    if (slashResult.exit) break;
    if (slashResult.handled) {
      const refreshedActive = getActiveRuntime({ workspaceSupervisor, cwd, runner, memoryStore, currentProject, currentProjectInfo, sessionState, sessionsRoot, projectMarchDir, extensionPaths, keybindingConfig, promptTemplateConfig });
      refreshStatusBar(contextTokenRefreshOptions(slashResult, refreshedActive.runner));
      continue;
    }

    const turnActive = getActiveRuntime({ workspaceSupervisor, cwd, runner, memoryStore, currentProject, currentProjectInfo, sessionState, sessionsRoot, projectMarchDir, extensionPaths, keybindingConfig, promptTemplateConfig });
    const templateResult = expandPromptTemplate(trimmed, turnActive.promptTemplateConfig.templates);
    if (templateResult.type === "template") {
      ui.writeln(brightBlack(`● template: ${templateResult.name}`));
      trimmed = templateResult.prompt;
    }

    if (turnActive.viewOnly) {
      ui.writeln("This session is view-only. Use /session and Take over control before sending prompts.");
      continue;
    }
    if (turnActive.turnTask) {
      ui.writeln("This session is still running. Use /session to start or inspect another session.");
      continue;
    }

    startReplTurn({
      runtime: turnActive,
      prompt: trimmed,
      ui,
      refreshStatusBar,
      setTurnRunning,
      workspaceSupervisor,
      modeState,
    });
  }
}

export function getActiveRuntime({ workspaceSupervisor, cwd, runner, memoryStore, currentProject, currentProjectInfo, sessionState, sessionsRoot, projectMarchDir, extensionPaths, keybindingConfig, promptTemplateConfig }) {
  return workspaceSupervisor?.getActive?.() ?? {
    project: currentProjectInfo,
    cwd,
    runner,
    memoryStore,
    currentProject,
    sessionState,
    sessionsRoot,
    projectMarchDir,
    extensionPaths,
    keybindingConfig,
    promptTemplateConfig,
  };
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

function startReplTurn({ runtime, prompt, ui, refreshStatusBar, setTurnRunning, workspaceSupervisor = null, modeState = null }) {
  const turnUi = runtime.ui ?? ui;
  const task = runReplTurn({
    prompt,
    runner: runtime.runner,
    memoryStore: runtime.memoryStore,
    currentProject: runtime.currentProject,
    ui: turnUi,
    refreshStatusBar,
    setTurnRunning,
    modeState,
  }).finally(() => {
    if (runtime.turnTask === task) runtime.turnTask = null;
    const hasRunningTurn = Boolean(workspaceSupervisor?.hasRunningTurn?.());
    setTurnRunning(hasRunningTurn);
    if (!hasRunningTurn) refreshStatusBar.stopWorking?.();
    refreshStatusBar();
  });
  runtime.turnTask = task;
}

async function runReplTurn({ prompt, runner, memoryStore, currentProject, ui, refreshStatusBar, setTurnRunning, modeState = null }) {
  memoryStore.beginTurn();
  setTurnRunning(true);
  refreshStatusBar.startWorking?.();
  try {
    const turnInput = await prepareTurnInput({ prompt, runner, memoryStore, currentProject, modeState });
    ui.writeln(turnInput.displayMessage);
    ui.recall?.({ hints: turnInput.userRecallHints, report: turnInput.userRecallReport });
    const result = await runner.runTurn(turnInput.fullPrompt, turnInput.userMessage, turnInput.runOptions);
    await handleTurnLifecycleAction(result?.lifecycleAction, { runner, ui });
    ui.writeln("");
  } catch (err) {
    ui.writeln(`Error: ${err.message}`);
  } finally {
    memoryStore.endTurn();
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
