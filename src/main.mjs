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
import { loadKeybindings } from "./cli/keybindings.mjs";
import { expandPromptTemplate, loadPromptTemplates } from "./cli/prompt-templates.mjs";
import { createStatusLineUpdater } from "./cli/status-line-updater.mjs";
import { wireTuiHandlers } from "./cli/tui-handlers.mjs";
import { createMarchAuthStorage } from "./auth/storage.mjs";
import { runLoginCommand } from "./auth/login-command.mjs";
import { createRunner } from "./agent/runner.mjs";
import { createCliShellRuntime } from "./shell/cli-runtime.mjs";
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
import { discoverProjectExtensionPaths } from "./extensions/discovery.mjs";
import { loadProjectLifecycleHookManifests } from "./extensions/lifecycle-manifest.mjs";
import { saveSession, loadSession } from "./session/persist.mjs";
import { listPiSessionInfos, resolvePiSessionManager } from "./session/pi-manager.mjs";
import { resumePiSessionById } from "./cli/pi-session-switch-command.mjs";
import { formatMessageAttachmentsForDisplay } from "./session/attachment-display.mjs";

export async function run(argv) {
  const args = parseCliArgs(argv);

  if (args.help) {
    showHelp();
    return 0;
  }

  if (args.command?.name === "login") {
    try {
      return await runLoginCommand({
        providerId: args.command.args[0] ?? args.provider,
      });
    } catch (err) {
      process.stderr.write(`Error: ${err.message}\n`);
      return 1;
    }
  }

  const cwd = process.cwd();

  const stateRoot = join(homedir(), ".march");
  if (!existsSync(stateRoot)) mkdirSync(stateRoot, { recursive: true });

  // Load config (CLI args override config file values)
  const config = loadConfig(cwd);
  const provider = args.provider ?? config.provider ?? "deepseek";
  const model = args.model ?? config.model ?? "deepseek-v4-pro";
  const skills = [...config.skills, ...args.skills];
  const pins = [...config.pins, ...args.pins];
  const extensionPaths = [
    ...discoverProjectExtensionPaths(cwd),
    ...args.extensions.map((extensionPath) => resolve(cwd, extensionPath)),
  ];
  const lifecycleManifests = loadProjectLifecycleHookManifests(cwd);
  const keybindingConfig = loadKeybindings(cwd);
  const promptTemplateConfig = loadPromptTemplates(cwd);
  const authConfig = createMarchAuthStorage({ provider, cwd });

  if (!authConfig.hasAuth) {
    process.stderr.write(`Error: no credentials configured for ${provider}. Set ${authConfig.apiKeyEnv} or run: march login ${provider}\n`);
    return 1;
  }

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
  const shellRuntime = args.shellRuntime ? createCliShellRuntime({ cwd }) : null;

  // Session persistence
  const usePiSessionDefaults = args.piSessionDefaults || !args.legacySessions;
  const usePiSessions = args.piSessions || usePiSessionDefaults;
  const usePiRuntimeHost = args.piRuntimeHost || usePiSessionDefaults;
  const sessionSource = usePiSessionDefaults ? "pi" : "legacy";
  const sessionsRoot = join(projectMarchDir, "sessions");
  const sessionState = {
    sessionId: args.resume ?? Date.now().toString(36),
    sessionDir: null,
  };
  sessionState.sessionDir = join(sessionsRoot, sessionState.sessionId);

  const ui = createUI({
    json: args.json,
    cwd,
    skillPool,
    keybindings: keybindingConfig.keybindings,
    promptTemplates: promptTemplateConfig.templates,
    shellRuntime,
  });

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
    shellRuntime,
    namespace,
    projectMarchDir,
    extensionPaths,
    sessionManager: resolvePiSessionManager({
      cwd,
      projectMarchDir,
      enabled: usePiSessions,
    }),
    useRuntimeHost: usePiRuntimeHost,
    syncPiSidecar: usePiSessions || usePiRuntimeHost,
    lifecycleHooks: lifecycleManifests.hooks,
    lifecycleDiagnostics: lifecycleManifests.diagnostics,
    authStorage: authConfig.authStorage,
  });

  const refreshStatusBar = createStatusLineUpdater({
    ui,
    runner,
    sessionState,
    sessionSource,
  });
  refreshStatusBar();

  wireTuiHandlers({
    ui,
    runner,
    sessionState,
    projectMarchDir,
    refreshStatusBar,
    isTurnRunning: () => turnRunning,
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
  await resumeStartupSession({
    resumeId: args.resume,
    usePiSessionDefaults,
    runner,
    sessionState,
    sessionsRoot,
    projectMarchDir,
    skillPool,
    ui,
  });
  refreshStatusBar();

  // Single-shot mode
  if (args.prompt) {
    const context = runner.engine.buildContext(args.prompt);
    const fullPrompt = `${context}\n\n[user]\n${args.prompt}`;
    ui.writeln(`\x1b[1m[user]\x1b[0m ${formatMessageAttachmentsForDisplay(args.prompt)}`);
    turnRunning = true;
    await runner.runTurn(fullPrompt, args.prompt);
    turnRunning = false;
    refreshStatusBar();
    // Post-turn dump: context with this turn in recent_chat
    if (args.dumpContext) {
      const postCtx = runner.engine.buildContext("");
      writeFileSync(resolve(projectMarchDir, "context-snapshot.txt"), postCtx, "utf8");
    }
    if (!usePiSessionDefaults) saveSession(sessionState.sessionDir, runner.engine);
    await runner.dispose();
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
      if (!usePiSessionDefaults) saveSession(sessionState.sessionDir, runner.engine);
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
      sessionSource,
      extensionPaths,
      keybindings: keybindingConfig.keybindings,
      keybindingDiagnostics: keybindingConfig.diagnostics,
      promptTemplates: promptTemplateConfig.templates,
      promptTemplateDiagnostics: promptTemplateConfig.diagnostics,
    });
    if (slashResult.exit) break;
    if (slashResult.handled) {
      refreshStatusBar();
      continue;
    }

    const templateResult = expandPromptTemplate(trimmed, promptTemplateConfig.templates);
    if (templateResult.type === "template") {
      ui.writeln(`\x1b[90m● template: ${templateResult.name}\x1b[0m`);
      trimmed = templateResult.prompt;
    }

    const context = runner.engine.buildContext(args.prompt || trimmed);
    const fullPrompt = `${context}\n\n[user]\n${trimmed}`;
    try {
      ui.writeln(`\x1b[1m[user]\x1b[0m ${formatMessageAttachmentsForDisplay(trimmed)}`);
      turnRunning = true;
      await runner.runTurn(fullPrompt, trimmed);
      turnRunning = false;
      refreshStatusBar();
      // Post-turn dump: includes this turn in recent_chat
      if (args.dumpContext) {
        const postCtx = runner.engine.buildContext("");
        writeFileSync(resolve(projectMarchDir, "context-snapshot.txt"), postCtx, "utf8");
      }
      ui.writeln("");
    } catch (err) {
      turnRunning = false;
      refreshStatusBar();
      ui.writeln(`Error: ${err.message}`);
    }
  }

  await runner.dispose();
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

export async function resumeStartupSession({
  resumeId,
  usePiSessionDefaults,
  runner,
  sessionState,
  sessionsRoot,
  projectMarchDir,
  skillPool = [],
  ui,
  listPiSessions = listPiSessionInfos,
  loadLegacySession = loadSession,
}) {
  if (!resumeId) return { source: "none", lines: [] };

  if (usePiSessionDefaults) {
    const sessions = await listPiSessions({
      cwd: runner.engine.cwd,
      projectMarchDir,
    });
    const lines = await resumePiSessionById(resumeId, {
      runner,
      sessions,
      projectMarchDir,
      skillPool,
    });
    for (const line of lines) ui.status(line);
    return { source: "pi", lines };
  }

  const saved = loadLegacySession(sessionState.sessionDir);
  if (saved) {
    runner.engine.restoreSession(saved, skillPool);
    const line = `Resumed legacy session ${sessionState.sessionId} (${saved.turns.length} turns)`;
    ui.status(line);
    return { source: "legacy", lines: [line] };
  }

  const line = `Session ${sessionState.sessionId} not found — starting fresh`;
  ui.status(line);
  return { source: "legacy", lines: [line] };
}
