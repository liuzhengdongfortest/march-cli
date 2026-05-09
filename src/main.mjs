import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
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
  const provider = args.provider ?? config.provider ?? "deepseek";
  const model = args.model ?? config.model ?? "deepseek-v4-pro";
  const skills = [...config.skills, ...args.skills];
  const pins = [...config.pins, ...args.pins];

  // Memory system: global SQLite database at ~/.march/memory.db
  // Project isolation via .march/project-id namespace
  const projectMarchDir = resolve(cwd, ".march");
  if (!existsSync(projectMarchDir)) mkdirSync(projectMarchDir, { recursive: true });
  const namespace = loadOrCreateProjectId(projectMarchDir);
  const memoryDb = openDatabase(resolve(stateRoot, "memory.db"));
  const changesetStore = new ChangesetStore(memoryDb);
  const searchIndexer = new SearchIndexer(memoryDb);
  const graph = new GraphService(memoryDb, { changesetStore, searchIndexer, namespace });
  const glossary = new GlossaryService(memoryDb, namespace);
  const systemViews = new SystemViews(memoryDb, graph, glossary, namespace);
  const memoryTools = createMemoryTools(graph, glossary, searchIndexer, systemViews, namespace);

  // Skills system: discover pool, activate only via --skill flag or tool
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

  const ui = createUI({ json: args.json, cwd, skillPool });

  const apiKeyEnv = provider === "deepseek" ? "DEEPSEEK_API_KEY"
    : provider === "openai" ? "OPENAI_API_KEY"
    : provider === "anthropic" ? "ANTHROPIC_API_KEY"
    : `${provider.toUpperCase()}_API_KEY`;
  if (!process.env[apiKeyEnv]) {
    ui.writeln(`Error: ${apiKeyEnv} environment variable is not set.`);
    ui.close();
    return 1;
  }

  ui.status(`Starting March session ${sessionId} in ${cwd}`);

  // Esc to abort current turn
  let turnRunning = false;

  const runner = await createRunner({
    cwd,
    modelId: model,
    provider,
    stateRoot,
    ui,
    skills: skills,
    skillPool,
    pins: pins,
    graph,
    glossary,
    memoryTools,
    skillTools,
    namespace,
  });

  ui.setEscapeHandler(() => {
    if (turnRunning) {
      runner.abort();
      ui.writeln(`\x1b[33m● aborted\x1b[0m`);
    }
  });

  ui.setShiftTabHandler(() => {
    const level = runner.cycleThinkingLevel();
    if (level) {
      ui.writeln(`\x1b[90m● thinking: ${level}\x1b[0m`);
    }
  });

  // Wire back-reference for skill tools → engine
  skillState.engine = runner.engine;
  // Activate skills requested via --skill flag (by name)
  if (args.skills.length > 0) {
    for (const name of args.skills) {
      const skill = skillPool.find(s => s.name === name);
      if (skill && !skillState.active.find(a => a.name === name)) {
        skillState.active.push(skill);
      }
    }
  }
  if (skillState.active.length > 0) {
    runner.engine.setSkills([...skillState.active]);
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

  // Single-shot mode
  if (args.prompt) {
    const context = runner.engine.buildContext(args.prompt);
    const fullPrompt = `${context}\n\n[user]\n${args.prompt}`;
    ui.writeln(`\x1b[1m[user]\x1b[0m ${args.prompt}`);
    turnRunning = true;
    await runner.runTurn(fullPrompt, args.prompt);
    turnRunning = false;
    // Post-turn dump: context with this turn in recent_chat
    if (args.dumpContext) {
      const postCtx = runner.engine.buildContext("");
      writeFileSync(resolve(projectMarchDir, "context-snapshot.txt"), postCtx, "utf8");
    }
    saveSession(sessionDir, runner.engine);
    runner.dispose();
    ui.writeln("");
    ui.close();
    return 0;
  }

  // REPL mode
  if (args.dumpContext) {
    const bootCtx = runner.engine.buildContext("");
    writeFileSync(resolve(projectMarchDir, "context-snapshot.txt"), bootCtx, "utf8");
    const snapshotPath = resolve(projectMarchDir, "context-snapshot.txt");
    ui.writeln(`Context snapshot: ${snapshotPath} (${bootCtx.split("\n\n").length} layers, ${bootCtx.length} chars)`);
  }

  ui.writeln("March REPL. Type /help for commands, Esc to abort, /exit to quit.");
  ui.writeln("");
  let lastInlineShellCommand = "";

  for (;;) {
    const line = await ui.readline("> ");
    if (line === null) {
      saveSession(sessionDir, runner.engine);
      break;
    }
    let trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === "/exit" || trimmed === "/quit") {
      saveSession(sessionDir, runner.engine);
      ui.writeln(`Session saved: ${sessionId}`);
      break;
    }
    const inlineShell = parseInlineShellInput(trimmed, lastInlineShellCommand);
    if (inlineShell.type === "error") {
      ui.writeln(`Error: ${inlineShell.message}`);
      continue;
    }
    if (inlineShell.type === "command") {
      lastInlineShellCommand = inlineShell.command;
      runInlineShellCommand(inlineShell.command, { cwd, ui });
      continue;
    }
    const skillInvocation = parseSkillInvocation(trimmed);
    if (skillInvocation.type === "skill") {
      const skill = skillPool.find(s => s.name === skillInvocation.name);
      if (!skill) {
        ui.writeln(`Error: skill not found: ${skillInvocation.name}`);
        continue;
      }
      if (!skillState.active.find(s => s.name === skill.name)) {
        skillState.active.push(skill);
        runner.engine.setSkills([...skillState.active]);
      }
      ui.writeln(`Activated skill: ${skill.name}`);
      if (!skillInvocation.prompt) continue;
      trimmed = skillInvocation.prompt;
    }
    if (trimmed === "/help") {
      ui.writeln("Commands: /exit, /help, /hotkeys, /model, /models, /compact, /session, /sessions, /status, /save, /mouse, /pin <path>, /unpin <path>, /pins");
      ui.writeln("Shortcuts: Esc = abort turn, Ctrl+O = toggle tool output, Ctrl+G = external editor, Shift+Tab = thinking level");
      continue;
    }
    if (trimmed === "/hotkeys") {
      for (const line of formatHotkeysPanel()) ui.writeln(line);
      continue;
    }
    if (trimmed === "/thinking") {
      ui.writeln("Thinking blocks are always expanded (italic).");
      continue;
    }
    if (trimmed === "/mouse") {
      const on = ui.toggleMouse();
      ui.writeln(on ? "Mouse tracking: ON (click-to-expand enabled, text selection disabled)" : "Mouse tracking: OFF (text selection enabled)");
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

    if (trimmed === "/model") {
      try {
        const result = await runner.session.cycleModel();
        if (result) {
          const name = result.model.name || result.model.id;
          ui.writeln(`Model: ${name} (${result.model.provider})  thinking: ${result.thinkingLevel}`);
        } else {
          ui.writeln("(only one model available)");
        }
      } catch (err) {
        ui.writeln(`Error: ${err.message}`);
      }
      continue;
    }

    if (trimmed === "/models") {
      const current = runner.session.model;
      if (current) {
        ui.writeln(`Current: ${current.name || current.id} (${current.provider})`);
      }
      const scoped = runner.session.scopedModels;
      if (scoped.length > 0) {
        for (const s of scoped) {
          const name = s.model.name || s.model.id;
          const mark = (current && s.model.id === current.id && s.model.provider === current.provider) ? " *" : "  ";
          ui.writeln(`${mark} ${name} (${s.model.provider})`);
        }
      } else {
        ui.writeln("(no scoped models — use --model flag or /model to cycle)");
      }
      continue;
    }

    if (trimmed === "/compact") {
      try {
        const result = await runner.session.compact();
        if (result) {
          ui.writeln(`Compacted: ${result.summary?.length ?? 0} char summary`);
        } else {
          ui.writeln("Compaction complete (nothing to compact)");
        }
      } catch (err) {
        ui.writeln(`Error: ${err.message}`);
      }
      continue;
    }

    if (trimmed === "/session") {
      const stats = runner.session.getSessionStats();
      ui.writeln(`session: ${stats.sessionId}`);
      ui.writeln(`messages: ${stats.userMessages}u + ${stats.assistantMessages}a + ${stats.toolCalls}t = ${stats.totalMessages} total`);
      ui.writeln(`tokens: ${stats.tokens.input} in / ${stats.tokens.output} out (${stats.tokens.cacheRead} cache read, ${stats.tokens.cacheWrite} cache write)`);
      ui.writeln(`cost: $${stats.cost.toFixed(4)}`);
      continue;
    }

    const context = runner.engine.buildContext(args.prompt || trimmed);
    const fullPrompt = `${context}\n\n[user]\n${trimmed}`;
    try {
      ui.writeln(`\x1b[1m[user]\x1b[0m ${trimmed}`);
      turnRunning = true;
      await runner.runTurn(fullPrompt, trimmed);
      turnRunning = false;
      // Post-turn dump: includes this turn in recent_chat
      if (args.dumpContext) {
        const postCtx = runner.engine.buildContext("");
        writeFileSync(resolve(projectMarchDir, "context-snapshot.txt"), postCtx, "utf8");
      }
      ui.writeln("");
    } catch (err) {
      turnRunning = false;
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

function loadOrCreateProjectId(projectMarchDir) {
  const idFile = resolve(projectMarchDir, "project-id");
  if (existsSync(idFile)) {
    return readFileSync(idFile, "utf8").trim();
  }
  const id = randomUUID();
  writeFileSync(idFile, id, "utf8");
  return id;
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

export function parseInlineShellInput(input, lastCommand = "") {
  if (input === "!!") {
    if (!lastCommand) return { type: "error", message: "No previous inline shell command." };
    return { type: "command", command: lastCommand, repeated: true };
  }
  if (!input.startsWith("!")) return { type: "none" };
  const command = input.slice(1).trim();
  if (!command) return { type: "error", message: "Usage: ! <command>" };
  return { type: "command", command, repeated: false };
}

export function parseSkillInvocation(input) {
  const match = input.match(/^\/skill:([^\s]+)(?:\s+([\s\S]+))?$/);
  if (!match) return { type: "none" };
  return {
    type: "skill",
    name: match[1],
    prompt: (match[2] || "").trim(),
  };
}

export function runInlineShellCommand(command, { cwd = process.cwd(), ui } = {}) {
  const shell = process.platform === "win32"
    ? { bin: "powershell.exe", args: ["-NoProfile", "-Command", command] }
    : { bin: "bash", args: ["-lc", command] };
  ui?.writeln(`\x1b[2m$ ${command}\x1b[0m`);
  const result = spawnSync(shell.bin, shell.args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  if (result.stdout) {
    for (const line of result.stdout.replace(/\s+$/, "").split("\n")) {
      if (line) ui?.writeln(line);
    }
  }
  if (result.stderr) {
    for (const line of result.stderr.replace(/\s+$/, "").split("\n")) {
      if (line) ui?.writeln(`\x1b[31m${line}\x1b[0m`);
    }
  }
  if (result.error) {
    ui?.writeln(`\x1b[31mError: ${result.error.message}\x1b[0m`);
  } else if (result.status !== 0) {
    ui?.writeln(`\x1b[31mexit ${result.status}\x1b[0m`);
  }
  return result;
}

export function formatHotkeysPanel() {
  return [
    "Keyboard shortcuts:",
    "  Esc        Abort current turn; cancel retry wait",
    "  Shift+Tab  Cycle thinking level",
    "  Ctrl+G     Open external editor ($VISUAL or $EDITOR)",
    "  Ctrl+O     Toggle tool output collapsed/expanded",
    "Input prefixes:",
    "  /          Slash command autocomplete",
    "  @          File path autocomplete",
    "  ! cmd      Run local shell command without sending to the model",
    "  !!         Repeat previous local shell command",
  ];
}
