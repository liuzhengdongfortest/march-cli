import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { parseCliArgs, showHelp } from "./cli/args.mjs";
import { createUI } from "./cli/ui.mjs";
import { createRunner } from "./agent/runner.mjs";

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
    skills: args.skills,
    pins: args.pins,
  });

  // Single-shot mode
  if (args.prompt) {
    const context = runner.engine.buildContext();
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
    if (trimmed === "/status") {
      const s = runner.engine;
      ui.writeln(`model: ${s.modelId}  turns: ${s.turns.length}  skills: ${s.skills.join(", ") || "(none)"}  pins: ${s.pins.join(", ") || "(none)"}`);
      continue;
    }
    if (trimmed.startsWith("/pin ")) {
      const path = trimmed.slice(5).trim();
      runner.engine.setPins([...runner.engine.pins, path]);
      ui.writeln(`Pinned: ${path}`);
      continue;
    }
    if (trimmed === "/pins") {
      ui.writeln(runner.engine.pins.length > 0 ? runner.engine.pins.join("\n") : "(no pinned files)");
      continue;
    }
    if (trimmed.startsWith("/unpin ")) {
      const path = trimmed.slice(7).trim();
      runner.engine.setPins(runner.engine.pins.filter((p) => p !== path));
      ui.writeln(`Unpinned: ${path}`);
      continue;
    }

    const context = runner.engine.buildContext();
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
