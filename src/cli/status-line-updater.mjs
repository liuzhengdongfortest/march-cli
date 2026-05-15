import { statusBarLine } from "./commands/status-command.mjs";

export function createStatusLineUpdater({
  ui,
  runner,
  sessionState,
  sessionSource = "pi",
  getMode = () => undefined,
}) {
  let contextTokens = null;
  return (options = {}) => {
    if (typeof ui.setStatusBar !== "function") return null;
    if (Object.hasOwn(options, "contextTokens")) contextTokens = options.contextTokens;
    const line = statusBarLine({
      runner,
      sessionState,
      sessionSource,
      extensionDiagnostics: runner.getExtensionDiagnostics?.() ?? [],
      lifecycleState: runner.getExtensionLifecycleState?.() ?? null,
      mode: getMode(),
      contextTokens,
    });
    ui.setStatusBar(line);
    return line;
  };
}
