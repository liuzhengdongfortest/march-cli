import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { parseCliArgs, showHelp } from "./cli/args.mjs";
import { createUI } from "./cli/ui.mjs";
import { createRunner } from "./agent/runner.mjs";
import { buildContext } from "./context/engine.mjs";

export async function run(argv) {
  const args = parseCliArgs(argv);

  if (args.help) {
    showHelp();
    return 0;
  }

  const cwd = process.cwd();
  const stateRoot = join(homedir(), ".march");
  if (!existsSync(stateRoot)) mkdirSync(stateRoot, { recursive: true });

  const ui = createUI({ json: args.json });

  if (!process.env.DEEPSEEK_API_KEY) {
    ui.writeln("Error: DEEPSEEK_API_KEY environment variable is not set.");
    return 1;
  }

  ui.status(`Starting March session in ${cwd}`);

  const runner = await createRunner({
    cwd,
    modelId: args.model,
    stateRoot,
    ui,
  });

  const context = buildContext({ cwd, pins: args.pins, skills: args.skills });

  // Single-shot mode
  if (args.prompt) {
    const fullPrompt = `${context}\n\n[user]\n${args.prompt}`;
    await runner.runTurn(fullPrompt);
    runner.dispose();
    ui.writeln("");
    return 0;
  }

  // REPL mode
  ui.writeln("March REPL. Type /help for commands, /exit to quit.");
  ui.writeln("");

  for (;;) {
    const line = await ui.readline("> ");
    if (line === null) break;
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === "/exit" || trimmed === "/quit") break;
    if (trimmed === "/help") {
      ui.writeln("Commands: /exit, /help, /status, /pin <path>, /unpin <path>, /pins");
      continue;
    }

    const fullPrompt = `${context}\n\n[user]\n${trimmed}`;
    try {
      await runner.runTurn(fullPrompt);
      ui.writeln("");
    } catch (err) {
      ui.writeln(`Error: ${err.message}`);
    }
  }

  runner.dispose();
  ui.close();
  return 0;
}
