import { homedir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCliArgs, showHelp } from "./cli/args.mjs";
import { createUI } from "./cli/ui.mjs";
import { createPermissionController, MODE } from "./cli/permissions.mjs";
import { bold, brightBlack } from "./cli/ui-theme.mjs";
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
import { MarkdownMemoryStore, formatRecallHints } from "./memory/markdown-store.mjs";
import { createMarkdownMemoryTools } from "./memory/markdown-tools.mjs";
import { loadConfig } from "./config/loader.mjs";
import { discoverProjectExtensionPaths } from "./extensions/discovery.mjs";
import { loadProjectLifecycleHookManifests } from "./extensions/lifecycle-manifest.mjs";
import { saveSession } from "./session/persist.mjs";
import { resolvePiSessionManager } from "./session/pi-manager.mjs";
import { formatMessageAttachmentsForDisplay } from "./session/attachment-display.mjs";
import { loadOrCreateProjectId, resumeStartupSession } from "./cli/startup-session.mjs";
import { activateStartupSkills, createStartupSkillRuntime } from "./cli/startup-skills.mjs";
import { initializeMcp } from "./mcp/index.mjs";
import { createWebTools } from "./web/tools.mjs";
import { createModelContextDumper } from "./debug/model-context-dumper.mjs";
import { runProviderConfigCommand } from "./provider/config-command.mjs";

function loadDotEnv(cwd) {
  for (const dir of [cwd, dirname(fileURLToPath(import.meta.url))]) {
    const path = join(dir, ".env");
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

export async function run(argv) {
  const cwd = process.cwd();
  loadDotEnv(cwd);

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

  if (args.command?.name === "provider") {
    if (args.providerConfig) return await runProviderConfigCommand({ homeDir: homedir() });
    process.stderr.write("Usage: march provider --config\n");
    return 1;
  }

  const stateRoot = join(homedir(), ".march");
  if (!existsSync(stateRoot)) mkdirSync(stateRoot, { recursive: true });

  // Load config (CLI args override config file values)
  const config = loadConfig(cwd);
  const provider = args.provider ?? config.provider ?? null;
  const model = args.model ?? config.model ?? null;
  const skills = [...config.skills, ...args.skills];
  const pins = [...config.pins, ...args.pins];
  const extensionPaths = [
    ...discoverProjectExtensionPaths(cwd),
    ...args.extensions.map((extensionPath) => resolve(cwd, extensionPath)),
  ];
  const lifecycleManifests = loadProjectLifecycleHookManifests(cwd);
  const keybindingConfig = loadKeybindings(cwd);
  const promptTemplateConfig = loadPromptTemplates(cwd);
  const authConfig = createMarchAuthStorage({ provider: provider ?? "deepseek", providers: config.providers, cwd });

  if (!authConfig.hasAuth) {
    process.stderr.write("Error: no providers configured. Run: march provider --config\n");
    return 1;
  }

  const projectMarchDir = resolve(cwd, ".march");
  if (!existsSync(projectMarchDir)) mkdirSync(projectMarchDir, { recursive: true });
  const namespace = loadOrCreateProjectId(projectMarchDir);
  const memoryRoot = resolveMemoryRoot(config.memoryRoot, stateRoot);
  const memoryStore = new MarkdownMemoryStore({ root: memoryRoot });
  const memoryTools = createMarkdownMemoryTools(memoryStore);
  const currentProject = basename(cwd);

  const { skillPool, skillState, skillTools } = createStartupSkillRuntime({
    cwd,
    configuredSkills: config.skills,
    cliSkills: args.skills,
  });
  const shellRuntime = args.shellRuntime ? createCliShellRuntime({ cwd }) : null;

  // MCP: connect to configured MCP servers
  const mcpInit = await initializeMcp({ projectDir: cwd });
  const { clientManager: mcpClientManager, mcpTools, mcpInjections } = mcpInit;
  for (const { server, error } of mcpInit.errors) {
    if (args.json) {
      // errors will be surfaced in diagnostics via runner status
    } else {
      process.stderr.write(`[mcp] ${server}: ${error}\n`);
    }
  }

  // Web tools: search + fetch
  const tavilyKey = process.env.TAVILY_API_KEY ?? "";
  const webTools = createWebTools({ tavilyKey });

  // Permission controller
  const permissionMode = args.permissionMode ?? MODE.DEFAULT;
  const permissionController = createPermissionController({ mode: permissionMode });

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
  const contextDumpRoot = resolve(projectMarchDir, "context-dumps", sessionState.sessionId);
  const modelContextDumper = createModelContextDumper({
    enabled: args.dumpContext,
    rootDir: contextDumpRoot,
  });

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
    providers: config.providers,
    stateRoot,
    ui,
    skills: skills,
    skillPool,
    pins: pins,
    memoryStore,
    memoryTools,
    skillTools,
    shellRuntime,
    mcpTools,
    mcpInjections,
    mcpClientManager,
    webTools,
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
    permissionController,
    modelContextDumper,
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
  activateStartupSkills({ skillState, skillPool, skillNames: args.skills, engine: runner.engine });

  // Resume session
  await resumeStartupSession({
    resumeId: args.resume,
    usePiSessionDefaults,
    runner,
    sessionState,
    projectMarchDir,
    skillPool,
    ui,
  });
  refreshStatusBar();

  // Single-shot mode
  if (args.prompt) {
    memoryStore.beginTurn();
    const userRecallHints = memoryStore.recallForUser(args.prompt, { currentProject });
    const context = runner.engine.buildContext(args.prompt);
    const recallBlock = formatRecallHints("user", userRecallHints);
    const fullPrompt = `${context}\n\n[user]\n${args.prompt}${recallBlock ? `\n\n${recallBlock}` : ""}`;
    ui.writeln(`${bold("[user]")} ${formatMessageAttachmentsForDisplay(args.prompt)}`);
    turnRunning = true;
    try {
      await runner.runTurn(fullPrompt, args.prompt, { userRecallHints, currentProject });
    } finally {
      memoryStore.endTurn();
      turnRunning = false;
    }
    refreshStatusBar();
    if (!usePiSessionDefaults) saveSession(sessionState.sessionDir, runner.engine);
    await runner.dispose();
    ui.writeln("");
    await ui.close();
    return 0;
  }

  if (args.dumpContext) ui.writeln(`Context dumps: ${contextDumpRoot}`);

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
      ui.writeln(brightBlack(`● template: ${templateResult.name}`));
      trimmed = templateResult.prompt;
    }

    memoryStore.beginTurn();
    const userRecallHints = memoryStore.recallForUser(trimmed, { currentProject });
    const context = runner.engine.buildContext(args.prompt || trimmed);
    const recallBlock = formatRecallHints("user", userRecallHints);
    const fullPrompt = `${context}\n\n[user]\n${trimmed}${recallBlock ? `\n\n${recallBlock}` : ""}`;
    try {
      ui.writeln(`${bold("[user]")} ${formatMessageAttachmentsForDisplay(trimmed)}`);
      turnRunning = true;
      await runner.runTurn(fullPrompt, trimmed, { userRecallHints, currentProject });
      turnRunning = false;
      memoryStore.endTurn();
      refreshStatusBar();
      ui.writeln("");
    } catch (err) {
      turnRunning = false;
      memoryStore.endTurn();
      refreshStatusBar();
      ui.writeln(`Error: ${err.message}`);
    }
  }

  await runner.dispose();
  await ui.close();
  return 0;
}

function resolveMemoryRoot(configured, stateRoot) {
  if (configured) return resolve(String(configured));
  if (process.env.MARCH_MEMORY_ROOT) return resolve(process.env.MARCH_MEMORY_ROOT);
  return resolve(stateRoot, "March Memories");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const code = await run(process.argv.slice(2));
  process.exit(code);
}
