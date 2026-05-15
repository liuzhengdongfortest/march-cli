import { listExtensionPathsCommand } from "./commands/extensions-command.mjs";
import { handleExportCommand, parseExportCommand } from "./commands/export-command.mjs";
import { handleModelCommand, listModels, parseModelCommand } from "./commands/model-command.mjs";
import { formatHotkeysPanel } from "./repl-commands.mjs";
import { listSessionStats } from "./session/session-command.mjs";
import { copyLastAssistantMessage } from "./commands/copy-command.mjs";
import { handleSessionSourceCommand } from "./session/session-source-command.mjs";
import { statusCommand } from "./commands/status-command.mjs";
import { handleThinkingCommand, parseThinkingCommand } from "./commands/thinking-command.mjs";
import { formatPromptTemplateLines } from "./input/prompt-templates.mjs";
import { handleSettingsCommand, parseSettingsCommand } from "../config/settings-command.mjs";
import { handleSessionNameCommand, parseSessionNameCommand } from "./session/session-name-command.mjs";
import { handleShellCommand, parseShellCommand } from "./shell/shell-command.mjs";
import { handlePinCommand, parsePinCommand } from "./commands/pin-command.mjs";
import { handleProviderCommand, parseProviderCommand } from "./commands/provider-command.mjs";
import { formatHelpLines } from "./commands/help-command.mjs";

export async function handleSlashCommand(trimmed, {
  ui,
  runner,
  sessionState,
  sessionsRoot,
  projectMarchDir,
  skillPool = [],
  sessionSource = "legacy",
  extensionPaths = [],
  keybindings,
  keybindingDiagnostics = [],
  promptTemplates = [],
  promptTemplateDiagnostics = [],
  settingsHomeDir,
  writeClipboard,
}) {
  if (trimmed === "/exit" || trimmed === "/quit") {
    await handleSessionSourceCommand("/save", { ui, runner, sessionState, sessionSource });
    return { handled: true, exit: true };
  }

  if (trimmed === "/help") {
    for (const line of formatHelpLines()) ui.writeln(line);
    return { handled: true };
  }

  if (trimmed === "/hotkeys") {
    for (const line of formatHotkeysPanel(keybindings, keybindingDiagnostics)) ui.writeln(line);
    return { handled: true };
  }

  if (trimmed === "/templates") {
    for (const line of formatPromptTemplateLines(promptTemplates, promptTemplateDiagnostics)) ui.writeln(line);
    return { handled: true };
  }

  const exportCommand = parseExportCommand(trimmed);
  if (exportCommand.type !== "none") {
    for (const line of await handleExportCommand(exportCommand, { runner, sessionState, sessionSource, projectMarchDir })) ui.writeln(line);
    return { handled: true };
  }

  const settingsCommand = parseSettingsCommand(trimmed);
  if (settingsCommand.type !== "none") {
    for (const line of handleSettingsCommand(settingsCommand, { cwd: runner.engine.cwd, homeDir: settingsHomeDir })) {
      ui.writeln(line);
    }
    return { handled: true };
  }

  if (trimmed === "/extensions") {
    for (const line of listExtensionPathsCommand(
      extensionPaths,
      runner.getExtensionDiagnostics?.(),
      runner.getExtensionLifecycleState?.(),
    )) ui.writeln(line);
    return { handled: true };
  }

  const thinkingCommand = parseThinkingCommand(trimmed);
  if (thinkingCommand.type !== "none") {
    for (const line of handleThinkingCommand(thinkingCommand, { runner })) ui.writeln(line);
    return { handled: true };
  }

  if (trimmed === "/mouse") {
    const on = ui.toggleMouse();
    ui.writeln(on ? "Mouse tracking: ON (click-to-expand enabled, text selection disabled)" : "Mouse tracking: OFF (text selection enabled)");
    return { handled: true };
  }

  if (trimmed === "/status") {
    for (const line of statusCommand({
      runner,
      sessionState,
      sessionSource,
      extensionDiagnostics: runner.getExtensionDiagnostics?.() ?? [],
      lifecycleState: runner.getExtensionLifecycleState?.() ?? null,
    })) ui.writeln(line);
    return { handled: true };
  }

  const shellCommand = parseShellCommand(trimmed);
  if (shellCommand.type !== "none") {
    for (const line of handleShellCommand(shellCommand, { shellRuntime: runner.shellRuntime })) ui.writeln(line);
    return { handled: true };
  }

  const nameCommand = parseSessionNameCommand(trimmed);
  if (nameCommand.type !== "none") {
    for (const line of handleSessionNameCommand(nameCommand, { runner, sessionState, sessionSource })) ui.writeln(line);
    return { handled: true };
  }

  if (trimmed === "/copy") {
    for (const line of copyLastAssistantMessage({ engine: runner.engine, writeClipboard })) ui.writeln(line);
    return { handled: true };
  }

  const pinCommand = parsePinCommand(trimmed);
  if (pinCommand.type !== "none") {
    for (const line of handlePinCommand(pinCommand, { engine: runner.engine })) ui.writeln(line);
    return { handled: true };
  }

  const sessionSourceCommand = await handleSessionSourceCommand(trimmed, {
    ui,
    runner,
    sessionState,
    sessionsRoot,
    projectMarchDir,
    skillPool,
    sessionSource,
  });
  if (sessionSourceCommand.handled) return sessionSourceCommand;

  const providerCommand = parseProviderCommand(trimmed);
  if (providerCommand.type !== "none") {
    try {
      ui.writeln(await handleProviderCommand(providerCommand, { ui, runner }));
    } catch (err) {
      ui.writeln(`Error: ${err.message}`);
    }
    return { handled: true };
  }

  const modelCommand = parseModelCommand(trimmed);
  if (modelCommand.type !== "none") {
    try {
      ui.writeln(await handleModelCommand(modelCommand, { runner, ui }));
    } catch (err) {
      ui.writeln(`Error: ${err.message}`);
    }
    return { handled: true };
  }

  if (trimmed === "/models") {
    for (const line of listModels({ runner })) ui.writeln(line);
    return { handled: true };
  }

  if (trimmed === "/session") {
    for (const line of listSessionStats({ runner })) ui.writeln(line);
    return { handled: true };
  }

  return { handled: false };
}
