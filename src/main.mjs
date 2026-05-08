import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { parseCliArgs, showHelp } from "./cli/args.mjs";
import { createUI } from "./cli/ui.mjs";
import { createRunner } from "./agent/runner.mjs";
import { openDatabase } from "./memory/database.mjs";
import { GraphService } from "./memory/graph.mjs";
import { GlossaryService } from "./memory/glossary.mjs";
import { ChangesetStore } from "./memory/snapshot.mjs";
import { SearchIndexer } from "./memory/search.mjs";
import { createMemoryTools } from "./memory/tools.mjs";
import { scanSkillDir, loadSkillFromFile } from "./skills/loader.mjs";
import { createSkillTools } from "./skills/tools.mjs";

export async function run(argv) {
  const args = parseCliArgs(argv);

  if (args.help) {
    showHelp();
    return 0;
  }

  const cwd = process.cwd();
  const stateRoot = join(homedir(), ".march");
  if (!existsSync(stateRoot)) mkdirSync(stateRoot, { recursive: true });

  // Memory system: project-bound SQLite database
  const projectMarchDir = resolve(cwd, ".march");
  if (!existsSync(projectMarchDir)) mkdirSync(projectMarchDir, { recursive: true });
  const memoryDb = openDatabase(resolve(projectMarchDir, "memory.db"));
  const changesetStore = new ChangesetStore(memoryDb);
  const searchIndexer = new SearchIndexer(memoryDb);
  const graph = new GraphService(memoryDb, { changesetStore, searchIndexer });
  const glossary = new GlossaryService(memoryDb);
  const memoryTools = createMemoryTools(graph, glossary, searchIndexer);

  // Skills system: scan .march/skills/ + --skill flags
  const skillPool = scanSkillDir(resolve(cwd, ".march", "skills"));
  for (const skillPath of args.skills) {
    try {
      const skill = loadSkillFromFile(skillPath);
      if (!skillPool.find(s => s.name === skill.name)) {
        skillPool.push(skill);
      }
    } catch {}
  }
  const skillState = { active: [], engine: null };
  const skillTools = createSkillTools(skillState, skillPool);

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
    graph,
    glossary,
    memoryTools,
    skillTools,
  });

  // Wire back-reference for skill tools → engine
  skillState.engine = runner.engine;
  // Auto-activate skills from --skill flags
  if (args.skills.length > 0) {
    for (const skill of skillPool) {
      if (args.skills.includes(skill.path)) {
        skillState.active.push(skill);
      }
    }
    if (skillState.active.length > 0) {
      runner.engine.setSkills([...skillState.active]);
    }
  }

  // Single-shot mode
  if (args.prompt) {
    const context = runner.engine.buildContext(args.prompt || trimmed);
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
      ui.writeln(`model: ${s.modelId}  turns: ${s.turns.length}  open: ${s.openFiles.size}  skills: ${s.skills.join(", ") || "(none)"}  pins: ${s.getPins().join(", ") || "(none)"}`);
      continue;
    }
    if (trimmed.startsWith("/pin ")) {
      const raw = trimmed.slice(5).trim();
      const absPath = runner.engine.resolvePath(raw);
      runner.engine.addPin(absPath);
      if (!runner.engine.isOpen(absPath)) {
        try {
          runner.engine.openFile(absPath);
        } catch {
          // File can't be opened yet — just pin it
        }
      }
      ui.writeln(`Pinned: ${absPath}`);
      continue;
    }
    if (trimmed === "/pins") {
      const pins = runner.engine.getPins();
      ui.writeln(pins.length > 0 ? pins.join("\n") : "(no pinned files)");
      continue;
    }
    if (trimmed.startsWith("/unpin ")) {
      const raw = trimmed.slice(7).trim();
      const absPath = runner.engine.resolvePath(raw);
      runner.engine.removePin(absPath);
      ui.writeln(`Unpinned: ${absPath}`);
      continue;
    }

    const context = runner.engine.buildContext(args.prompt || trimmed);
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
