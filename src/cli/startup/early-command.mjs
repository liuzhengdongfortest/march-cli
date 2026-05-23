import { homedir } from "node:os";
import { runLoginCommand } from "../../auth/login-command.mjs";
import { runProviderCommand } from "../../provider/command.mjs";
import { runWebSearchConfigCommand } from "../../web/config-command.mjs";
import { runMemoryCommand } from "../../memory/command.mjs";
import { resolveMemoryRoot } from "../../memory/root.mjs";
import { runConfiguredCliCommand } from "./configured-command.mjs";

export async function runEarlyCliCommand(args, { config, cwd, stateRoot }) {
  if (args.command?.name === "login") {
    try {
      return { handled: true, code: await runLoginCommand({ providerId: args.command.args[0] ?? args.provider }) };
    } catch (err) {
      process.stderr.write(`Error: ${err.message}\n`);
      return { handled: true, code: 1 };
    }
  }
  if (args.command?.name === "provider") return { handled: true, code: await runProviderCommand(args) };
  if (args.command?.name === "websearch") {
    if (args.providerConfig) return { handled: true, code: await runWebSearchConfigCommand({ homeDir: homedir() }) };
    process.stderr.write("Usage: march websearch --config\n");
    return { handled: true, code: 1 };
  }
  if (args.command?.name === "memory") {
    args.memoryRoot = resolveMemoryRoot(config.memoryRoot, stateRoot);
    return { handled: true, code: await runMemoryCommand(args, { homeDir: homedir() }) };
  }
  return await runConfiguredCliCommand(args, { config, cwd, stateRoot });
}
