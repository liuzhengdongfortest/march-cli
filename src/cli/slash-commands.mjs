import { runSlashCommand } from "./commands/registry/slash-command-registry.mjs";

export async function handleSlashCommand(trimmed, options) {
  return runSlashCommand(trimmed, normalizeSlashCommandOptions(options));
}

function normalizeSlashCommandOptions({
  sessionSource = "pi",
  extensionPaths = [],
  keybindings,
  keybindingDiagnostics = [],
  promptTemplates = [],
  promptTemplateDiagnostics = [],
  modeState = null,
  renderStartupBanner = null,
  settingsHomeDir,
  configHomeDir = settingsHomeDir,
  ...rest
}) {
  return {
    ...rest,
    sessionSource,
    extensionPaths,
    keybindings,
    keybindingDiagnostics,
    promptTemplates,
    promptTemplateDiagnostics,
    modeState,
    renderStartupBanner,
    settingsHomeDir,
    configHomeDir,
  };
}
