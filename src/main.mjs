import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCliArgs, showHelp } from "./cli/args.mjs";
import { createUI } from "./cli/ui.mjs";
import { createRunner } from "./agent/runner.mjs";
import { openDatabase } from "./memory/database.mjs";
import { GraphService } from "./memory/graph.mjs";
import { GlossaryService } from "./memory/glossary.mjs";
import { ChangesetStore } from "./memory/snapshot.mjs";
import { SearchIndexer } from "./memory/search.mjs";
import { createMemoryTools } from "./memory/tools.mjs";
import { SystemViews } from "./memory/system-views.mjs";
import { loadSkillPool, loadSkillFromFile } from "./skills/loader.mjs";
import { createSkillTools } from "./skills/tools.mjs";
import { loadConfig } from "./config/loader.mjs";
import { saveSession, loadSession, listSessions } from "./session/persist.mjs";

export async function run(argv) {
  const args = parseCliArgs(argv);

  if (args.help) {
    showHelp();
    return 0;
  }

  const cwd = process.cwd();

  // Load .env from project root (CONVENTIONS: API keys live in .env)
  loadDotEnv(resolve(cwd, ".env"));
  loadDotEnv(resolve(homedir(), ".march", ".env"));

  const stateRoot = join(homedir(), ".march");
  if (!existsSync(stateRoot)) mkdirSync(stateRoot, { recursive: true });

  // Load config (CLI args override config file values)
  const config = loadConfig(cwd);
  const model = args.model ?? config.model ?? "deepseek-v4-pro";
  const skills = [...config.skills, ...args.skills];
  const pins = [...config.pins, ...args.pins];

  // Memory system: project-bound SQLite database
  const projectMarchDir = resolve(cwd, ".march");
  if (!existsSync(projectMarchDir)) mkdirSync(projectMarchDir, { recursive: true });
  const memoryDb = openDatabase(resolve(projectMarchDir, "memory.db"));
  const changesetStore = new ChangesetStore(memoryDb);
  const searchIndexer = new SearchIndexer(memoryDb);
  const graph = new GraphService(memoryDb, { changesetStore, searchIndexer });
  const glossary = new GlossaryService(memoryDb);
  const systemViews = new SystemViews(memoryDb, graph, glossary);
  const memoryTools = createMemoryTools(graph, glossary, searchIndexer, systemViews);

  // Skills system: scan .march/skills/ + --skill flags + config
  const skillPool = loadSkillPool(cwd);
  for (const skillPath of skills) {
    try {
      const skill = loadSkillFromFile(skillPath);
      if (!skillPool.find(s => s.name === skill.name)) {
        skillPool.push(skill);
      }
    } catch {}
  }
  const skillState = { active: [], engine: null };
  const skillTools = createSkillTools(skillState, skillPool);

  // Session persistence
  const sessionId = args.resume ?? Date.now().toString(36);
  const sessionDir = join(projectMarchDir, "sessions", sessionId);

  const ui = createUI({ json: args.json });

  if (!process.env.DEEPSEEK_API_KEY) {
    ui.writeln("Error: DEEPSEEK_API_KEY environment variable is not set.");
    return 1;
  }

  ui.status(`Starting March session ${sessionId} in ${cwd}`);

  const runner = await createRunner({
    cwd,
    modelId: model,
    stateRoot,
    ui,
    skills: skills,
    pins: pins,
    graph,
    glossary,
    memoryTools,
    skillTools,
  });

  // Wire back-reference for skill tools → engine
  skillState.engine = runner.engine;
  // Auto-activate skills from --skill CLI flags
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

  // Resume session
  if (args.resume) {
    const saved = loadSession(sessionDir);
    if (saved) {
      runner.engine.restoreSession(saved, skillPool);
      ui.status(`Resumed session ${sessionId} (${saved.turns.length} turns)`);
    } else {
      ui.status(`Session ${sessionId} not found — starting fresh`);
    }
  }

  // --dump-context without prompt: dump boot context and exit (no API call)
  if (args.dumpContext && !args.prompt) {
    const context = runner.engine.buildContext("");
    writeFileSync(resolve(projectMarchDir, "context-snapshot.txt"), context, "utf8");
    const snapshotPath = resolve(projectMarchDir, "context-snapshot.txt");
    console.log(context);
    console.error(`\nWritten to: ${snapshotPath}`);
    console.error(`Layers: ${context.split("\n\n").length}  Length: ${context.length} chars`);
    runner.dispose();
    return 0;
  }

  // Single-shot mode
  if (args.prompt) {
    const context = runner.engine.buildContext(args.prompt);
    const fullPrompt = `${context}\n\n[user]\n${args.prompt}`;
    await runner.runTurn(fullPrompt, args.prompt);
    // Post-turn dump: context with this turn in recent_chat
    if (args.dumpContext) {
      const postCtx = runner.engine.buildContext("");
      writeFileSync(resolve(projectMarchDir, "context-snapshot.txt"), postCtx, "utf8");
    }
    saveSession(sessionDir, runner.engine);
    runner.dispose();
    ui.writeln("");
    return 0;
  }

  // REPL mode
  ui.writeln("March REPL. Type /help for commands, /exit to quit.");
  ui.writeln("");

  for (;;) {
    const line = await ui.readline("> ");
    if (line === null) {
      saveSession(sessionDir, runner.engine);
      break;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === "/exit" || trimmed === "/quit") {
      saveSession(sessionDir, runner.engine);
      ui.writeln(`Session saved: ${sessionId}`);
      break;
    }
    if (trimmed === "/help") {
      ui.writeln("Commands: /exit, /help, /sessions, /status, /save, /pin <path>, /unpin <path>, /pins");
      continue;
    }
    if (trimmed === "/status") {
      const s = runner.engine;
      ui.writeln(`session: ${sessionId}  model: ${s.modelId}  turns: ${s.turns.length}  open: ${s.openFiles.size}  skills: ${s.skills.map(s => typeof s === "string" ? s : s.name).join(", ") || "(none)"}  pins: ${s.getPins().join(", ") || "(none)"}`);
      continue;
    }
    if (trimmed === "/save") {
      saveSession(sessionDir, runner.engine);
      ui.writeln(`Session saved: ${sessionId}`);
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
    if (trimmed === "/sessions") {
      const sessions = listSessions(join(projectMarchDir, "sessions"));
      if (sessions.length === 0) {
        ui.writeln("(no saved sessions)");
      } else {
        for (const s of sessions) {
          const marker = s.id === sessionId ? " *" : "  ";
          ui.writeln(`${marker} ${s.id}  ${s.turnCount}t  ${s.cwd}  ${s.savedAt?.slice(0, 19) ?? "?"}`);
        }
        ui.writeln("(* = current session)");
      }
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
      await runner.runTurn(fullPrompt, trimmed);
      // Post-turn dump: includes this turn in recent_chat
      if (args.dumpContext) {
        const postCtx = runner.engine.buildContext("");
        writeFileSync(resolve(projectMarchDir, "context-snapshot.txt"), postCtx, "utf8");
      }
      ui.writeln("");
    } catch (err) {
      ui.writeln(`Error: ${err.message}`);
    }
  }

  runner.dispose();
  ui.close();
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const code = await run(process.argv.slice(2));
  process.exit(code);
}

function loadDotEnv(filePath) {
  try {
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      // Normalize to uppercase for case-insensitive matching (env vars are case-sensitive on Linux)
      const normalizedKey = key.toUpperCase();
      if (!process.env[key] && !process.env[normalizedKey]) {
        process.env[normalizedKey] = value;
      }
    }
  } catch {
    // .env file not found or unreadable — not an error
  }
}
