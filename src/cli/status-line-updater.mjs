import { statusCommand } from "./status-command.mjs";

export function createStatusLineUpdater({
  ui,
  runner,
  sessionState,
  sessionSource = "legacy",
}) {
  return () => {
    if (typeof ui.setStatusBar !== "function") return null;
    const [line] = statusCommand({
      runner,
      sessionState,
      sessionSource,
      extensionDiagnostics: runner.getExtensionDiagnostics?.() ?? [],
      lifecycleState: runner.getExtensionLifecycleState?.() ?? null,
    });
    ui.setStatusBar(line);
    return line;
  };
}
