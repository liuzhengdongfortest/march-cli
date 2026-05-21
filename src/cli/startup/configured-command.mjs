import { runBrowserCommand } from "../../browser/cli/command.mjs";
import { runGatewayCommand } from "../../gateway/command.mjs";

export async function runConfiguredCliCommand(args, { config, cwd, stateRoot }) {
  if (args.command?.name === "browser") {
    try {
      return { handled: true, code: await runBrowserCommand(args, { stateRoot }) };
    } catch (err) {
      process.stderr.write(`Error: ${err.message}\n`);
      return { handled: true, code: 1 };
    }
  }
  if (args.command?.name === "gateway" && args.command.args?.[0] !== "run") {
    return { handled: true, code: await runGatewayCommand(args, { config, cwd }) };
  }
  return { handled: false, code: null };
}
