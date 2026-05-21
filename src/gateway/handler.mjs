import { appendModeReminder } from "../cli/input/mode-state.mjs";
import { normalizeGatewayMessage } from "./message.mjs";
import { handleGatewaySlashCommand } from "./command-router.mjs";

export function createGatewayMessageHandler({ sessionStore, getRunner, currentProject = "" }) {
  return async function handleGatewayMessage(input) {
    const message = normalizeGatewayMessage(input);
    const session = sessionStore.getOrCreate(message);
    const runner = await getRunner(session);

    if (message.text.startsWith("/")) {
      const commandResult = await handleGatewaySlashCommand(message.text, { runner, session, sessionStore });
      if (commandResult.handled) {
        return { type: "command", session, lines: commandResult.lines };
      }
    }

    if (!session.workspaceRoot) {
      return { type: "error", session, lines: ["Error: no gateway workspace configured for this chat."] };
    }

    const prompt = appendModeReminder(message.text, session.modeState.get());
    const result = await runner.runTurn(prompt, message.text, { currentProject });
    return { type: "turn", session, result, lines: result?.draft ? [result.draft] : [] };
  };
}
