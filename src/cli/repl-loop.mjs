import { bold, brightBlack } from "./ui-theme.mjs";
import { handleSlashCommand } from "./slash-commands.mjs";
import { expandPromptTemplate } from "./prompt-templates.mjs";
import { parseInlineShellInput, parseSkillInvocation, runInlineShellCommand } from "./repl-commands.mjs";
import { formatRecallHints } from "../memory/markdown-store.mjs";
import { formatMessageAttachmentsForDisplay } from "../session/attachment-display.mjs";
import { saveSession } from "../session/persist.mjs";

export async function runSingleShotPrompt({
  prompt,
  runner,
  memoryStore,
  currentProject,
  ui,
  sessionState,
  usePiSessionDefaults,
  refreshStatusBar,
}) {
  memoryStore.beginTurn();
  const userRecallHints = memoryStore.recallForUser(prompt, { currentProject });
  const context = runner.engine.buildContext(prompt);
  const recallBlock = formatRecallHints("user", userRecallHints);
  const fullPrompt = `${context}\n\n[user]\n${prompt}${recallBlock ? `\n\n${recallBlock}` : ""}`;
  ui.writeln(`${bold("[user]")} ${formatMessageAttachmentsForDisplay(prompt)}`);
  try {
    await runner.runTurn(fullPrompt, prompt, { userRecallHints, currentProject });
  } finally {
    memoryStore.endTurn();
  }
  refreshStatusBar();
  if (!usePiSessionDefaults) saveSession(sessionState.sessionDir, runner.engine);
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
  skillPool,
  skillState,
  sessionSource,
  extensionPaths,
  keybindingConfig,
  promptTemplateConfig,
  usePiSessionDefaults,
  refreshStatusBar,
  setTurnRunning,
}) {
  let lastInlineShellCommand = "";

  for (;;) {
    const line = await ui.readline("> ");
    if (line === null) {
      if (!usePiSessionDefaults) saveSession(sessionState.sessionDir, runner.engine);
      break;
    }
    let trimmed = line.trim();
    if (!trimmed) continue;

    const handledInline = handleInlineCommand(trimmed, { cwd, ui, lastInlineShellCommand });
    if (handledInline.type === "handled") {
      lastInlineShellCommand = handledInline.lastInlineShellCommand;
      continue;
    }
    if (handledInline.type === "error") continue;

    const skillResult = handleSkillInvocation(trimmed, { skillPool, skillState, runner, ui });
    if (skillResult.type === "handled") continue;
    trimmed = skillResult.prompt;

    const slashResult = await handleSlashCommand(trimmed, {
      ui,
      runner,
      sessionState,
      sessionsRoot,
      projectMarchDir,
      skillPool,
      sessionSource,
      extensionPaths,
      keybindings: keybindingConfig.keybindings,
      keybindingDiagnostics: keybindingConfig.diagnostics,
      promptTemplates: promptTemplateConfig.templates,
      promptTemplateDiagnostics: promptTemplateConfig.diagnostics,
    });
    if (slashResult.exit) break;
    if (slashResult.handled) {
      refreshStatusBar();
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
    });
  }
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

function handleSkillInvocation(trimmed, { skillPool, skillState, runner, ui }) {
  const skillInvocation = parseSkillInvocation(trimmed);
  if (skillInvocation.type !== "skill") return { type: "none", prompt: trimmed };
  const skill = skillPool.find(s => s.name === skillInvocation.name);
  if (!skill) {
    ui.writeln(`Error: skill not found: ${skillInvocation.name}`);
    return { type: "handled" };
  }
  if (!skillState.active.find(s => s.name === skill.name)) {
    skillState.active.push(skill);
    runner.engine.setSkills([...skillState.active]);
  }
  ui.writeln(`Activated skill: ${skill.name}`);
  return skillInvocation.prompt ? { type: "none", prompt: skillInvocation.prompt } : { type: "handled" };
}

async function runReplTurn({ prompt, args, runner, memoryStore, currentProject, ui, refreshStatusBar, setTurnRunning }) {
  memoryStore.beginTurn();
  const userRecallHints = memoryStore.recallForUser(prompt, { currentProject });
  const context = runner.engine.buildContext(args.prompt || prompt);
  const recallBlock = formatRecallHints("user", userRecallHints);
  const fullPrompt = `${context}\n\n[user]\n${prompt}${recallBlock ? `\n\n${recallBlock}` : ""}`;
  try {
    ui.writeln(`${bold("[user]")} ${formatMessageAttachmentsForDisplay(prompt)}`);
    setTurnRunning(true);
    await runner.runTurn(fullPrompt, prompt, { userRecallHints, currentProject });
    setTurnRunning(false);
    memoryStore.endTurn();
    refreshStatusBar();
    ui.writeln("");
  } catch (err) {
    setTurnRunning(false);
    memoryStore.endTurn();
    refreshStatusBar();
    ui.writeln(`Error: ${err.message}`);
  }
}
