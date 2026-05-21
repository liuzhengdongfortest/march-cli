import { handleSlashCommand } from "../cli/slash-commands.mjs";
import { parseWorkspaceCommand, handleWorkspaceCommand } from "./workspace-command.mjs";

export async function handleGatewaySlashCommand(input, {
  runner,
  session,
  sessionStore,
  slashCommandHandler = handleSlashCommand,
} = {}) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed.startsWith("/")) return { handled: false, lines: [] };

  const workspaceCommand = parseWorkspaceCommand(trimmed);
  if (workspaceCommand.type !== "none") {
    return {
      handled: true,
      lines: handleWorkspaceCommand(workspaceCommand, { session, sessionStore }),
    };
  }

  const ui = createCollectingUi();
  const result = await slashCommandHandler(trimmed, {
    ui,
    runner,
    modeState: session.modeState,
    sessionState: { sessionId: session.marchSessionId },
    sessionSource: "gateway",
  });

  return {
    ...result,
    handled: Boolean(result?.handled),
    lines: ui.lines,
  };
}

function createCollectingUi() {
  const lines = [];
  return {
    lines,
    writeln(line = "") { lines.push(String(line)); },
    clearOutput() {},
  };
}
