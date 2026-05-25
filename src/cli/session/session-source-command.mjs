export async function handleSessionSourceCommand(trimmed, {
  ui,
  runner,
  sessionState,
}) {
  if (trimmed === "/save") {
    const stats = runner.getSessionStats?.();
    ui.writeln(`Pi session auto-saved: ${stats?.sessionId ?? sessionState.sessionId}`);
    return { handled: true };
  }

  return { handled: false };
}
