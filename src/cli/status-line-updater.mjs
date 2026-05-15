import { statusBarLine } from "./commands/status-command.mjs";

export function createStatusLineUpdater({
  ui,
  runner,
  sessionState,
  sessionSource = "legacy",
  getMode = () => undefined,
}) {
  return () => {
    if (typeof ui.setStatusBar !== "function") return null;
    const line = statusBarLine({
      runner,
      sessionState,
      sessionSource,
      extensionDiagnostics: runner.getExtensionDiagnostics?.() ?? [],
      lifecycleState: runner.getExtensionLifecycleState?.() ?? null,
      mode: getMode(),
    });
    ui.setStatusBar(line);
    return line;
  };
}
