import { homedir } from "node:os";
import { runProviderConfigCommand } from "./config-command.mjs";
import { runProviderShareCommand } from "./share-command.mjs";
import { runProviderAcceptCommand } from "./accept-command.mjs";
import { runProviderRemoveCommand } from "./remove-command.mjs";

export async function runProviderCommand(args, { homeDir = homedir(), stderr = process.stderr } = {}) {
  if (args.providerConfig) return await runProviderConfigCommand({ homeDir });
  if (args.command.args[0] === "share") {
    return await runProviderShareCommand({
      homeDir,
      providerId: args.command.args[1],
      includeKey: args.includeKey,
      profileOnly: args.profileOnly,
    });
  }
  if (args.command.args[0] === "accept") {
    return await runProviderAcceptCommand({ homeDir, token: args.command.args[1] });
  }
  if (args.command.args[0] === "remove" || args.command.args[0] === "uninstall") {
    return await runProviderRemoveCommand({ homeDir, providerId: args.command.args[1] });
  }
  stderr.write("Usage: march provider --config | march provider share [id] | march provider accept <token> | march provider remove\n");
  return 1;
}
