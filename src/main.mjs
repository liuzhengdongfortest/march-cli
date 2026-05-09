import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCliArgs, showHelp } from "./cli/args.mjs";
import { createUI } from "./cli/ui.mjs";
import { handleSlashCommand } from "./cli/slash-commands.mjs";
import {
  parseInlineShellInput,
  parseSkillInvocation,
  runInlineShellCommand,
} from "./cli/repl-commands.mjs";
import { buildModelSelectItems } from "./cli/model-command.mjs";
import { buildThinkingSelectItems } from "./cli/thinking-command.mjs";
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
import { saveSession, loadSession } from "./session/persist.mjs";
import { resolvePiSessionManager } from "./session/pi-manager.mjs";

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
  const sessionsRoot = join(projectMarchDir, "sessions");
  const sessionState = {
    sessionId: args.resume ?? Date.now().toString(36),
    sessionDir: null,
  };
  sessionState.sessionDir = join(sessionsRoot, sessionState.sessionId);

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

  ui.status(`Starting March session ${sessionState.sessionId} in ${cwd}`);

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
    sessionManager: resolvePiSessionManager({
      cwd,
      projectMarchDir,
      enabled: args.piSessions,
    }),
    useRuntimeHost: args.piRuntimeHost,
  });

  ui.setEscapeHandler(() => {
    if (turnRunning) {
      runner.abort();
      ui.writeln(`\x1b[33m● aborted\x1b[0m`);
    }
  });

  const cycleThinkingLevel = () => {
    const level = runner.cycleThinkingLevel();
    if (level) {
      ui.writeln(`\x1b[90m● thinking: ${level}\x1b[0m`);
    }
  };

  ui.setShiftTabHandler(cycleThinkingLevel);
  ui.setCtrlTHandler(async () => {
    try {
      const levels = runner.getAvailableThinkingLevels?.() || [];
      if (ui.selectList && levels.length > 0) {
        const current = runner.getThinkingLevel?.();
        const selectedIndex = Math.max(0, levels.indexOf(current));
        const item = await ui.selectList({
          items: buildThinkingSelectItems(levels, current),
          selectedIndex,
          width: 48,
        });
        if (!item) {
          ui.writeln(`\x1b[90m● thinking: unchanged\x1b[0m`);
          return;
        }
        ui.writeln(`\x1b[90m● thinking: ${runner.setThinkingLevel(item.level)}\x1b[0m`);
        return;
      }
      cycleThinkingLevel();
    } catch (err) {
      ui.writeln(`Error: ${err.message}`);
    }
  });

  ui.setCtrlLHandler(async () => {
    try {
      const scopedModels = runner.getScopedModels?.() || [];
      if (ui.selectList && scopedModels.length > 0) {
        const current = runner.getCurrentModel?.();
        const selectedIndex = Math.max(0, scopedModels.findIndex(({ model }) =>
          current && model.id === current.id && model.provider === current.provider
        ));
        const item = await ui.selectList({
          items: buildModelSelectItems({ current, scopedModels }),
          selectedIndex,
          width: 72,
        });
        if (!item) {
          ui.writeln(`\x1b[90m● model: unchanged\x1b[0m`);
          return;
        }
        const model = await runner.setModel(item.model);
        const name = model.name || model.id;
        ui.writeln(`\x1b[90m● model: ${name} (${model.provider})\x1b[0m`);
        return;
      }
      const result = await runner.cycleModel();
      if (result) {
        const name = result.model.name || result.model.id;
        ui.writeln(`\x1b[90m● model: ${name} (${result.model.provider})  thinking: ${result.thinkingLevel}\x1b[0m`);
      } else {
        ui.writeln(`\x1b[90m● model: only one available\x1b[0m`);
      }
    } catch (err) {
      ui.writeln(`Error: ${err.message}`);
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
    const saved = loadSession(sessionState.sessionDir);
    if (saved) {
      runner.engine.restoreSession(saved, skillPool);
      ui.status(`Resumed session ${sessionState.sessionId} (${saved.turns.length} turns)`);
    } else {
      ui.status(`Session ${sessionState.sessionId} not found — starting fresh`);
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
    saveSession(sessionState.sessionDir, runner.engine);
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
      saveSession(sessionState.sessionDir, runner.engine);
      break;
    }
    let trimmed = line.trim();
    if (!trimmed) continue;
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

    const slashResult = await handleSlashCommand(trimmed, {
      ui,
      runner,
      sessionState,
      sessionsRoot,
      projectMarchDir,
      skillPool,
    });
    if (slashResult.exit) break;
    if (slashResult.handled) {
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
