import { homedir } from "node:os";
import { join, resolve, dirname, basename, relative } from "node:path";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCliArgs, showHelp } from "./cli/args.mjs";
import { createUI } from "./cli/ui.mjs";
import { createPermissionController, MODE } from "./cli/permissions.mjs";
import { loadKeybindings } from "./cli/input/keybindings.mjs";
import { createInputHistoryStore } from "./cli/input/history-store.mjs";
import { createModeState } from "./cli/input/mode-state.mjs";
import { loadPromptTemplates } from "./cli/input/prompt-templates.mjs";
import { runInteractiveRepl, runSingleShotPrompt } from "./cli/repl-loop.mjs";
import { createStatusLineUpdater } from "./cli/status-line-updater.mjs";
import { wireTuiHandlers } from "./cli/tui/tui-handlers.mjs";
import { createMarchAuthStorage } from "./auth/storage.mjs";
import { runLoginCommand } from "./auth/login-command.mjs";
import { createRunner } from "./agent/runner.mjs";
import { createCliShellRuntime } from "./shell/cli-runtime.mjs";
import { MarkdownMemoryStore } from "./memory/markdown-store.mjs";
import { createMarkdownMemoryTools } from "./memory/markdown-tools.mjs";
import { loadConfig } from "./config/loader.mjs";
import { discoverProjectExtensionPaths } from "./extensions/discovery.mjs";
import { loadProjectLifecycleHookManifests } from "./extensions/lifecycle-manifest.mjs";
import { resolvePiSessionManager } from "./session/pi-manager.mjs";
import { loadOrCreateProjectId, resumeStartupSession } from "./cli/startup/startup-session.mjs";
import { formatStartupBanner } from "./cli/startup/startup-banner.mjs";
import { activateStartupSkills, createStartupSkillRuntime } from "./cli/startup/startup-skills.mjs";
import { initializeMcp } from "./mcp/index.mjs";
import { createWebToolsFromConfig } from "./web/tools.mjs";
import { createModelContextDumper } from "./debug/model-context-dumper.mjs";
import { runProviderConfigCommand } from "./provider/config-command.mjs";
import { runWebSearchConfigCommand } from "./web/config-command.mjs";

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

  if (args.command?.name === "provider" || args.command?.name === "websearch") {
    const command = args.command.name === "provider" ? runProviderConfigCommand : runWebSearchConfigCommand;
    if (args.providerConfig) return await command({ homeDir: homedir() });
    process.stderr.write(`Usage: march ${args.command.name} --config\n`);
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
  const inputHistoryStore = createInputHistoryStore({ path: join(projectMarchDir, "input-history.json") });
  const modeState = createModeState();
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

  const webTools = createWebToolsFromConfig(config);

  // Permission controller
  const permissionMode = args.permissionMode ?? MODE.BYPASS;
  const permissionController = createPermissionController({ mode: permissionMode });

  // Session persistence — always pi mode
  const usePiSessions = true;
  const usePiRuntimeHost = true;
  const sessionSource = "pi";
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
    historyStore: inputHistoryStore,
  });

  // Esc to abort current turn
  let turnRunning = false;
  let refreshStatusBar = null;

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
    maxTurns: config.maxTurns ?? undefined,
    trimBatch: config.trimBatch ?? undefined,
    permissionController,
    modelContextDumper,
    onModelPayload: ({ estimatedTokens }) => {
      refreshStatusBar?.({ contextTokens: estimatedTokens });
    },
  });

  refreshStatusBar = createStatusLineUpdater({
    ui,
    runner,
    sessionState,
    sessionSource,
    getMode: () => modeState.get(),
  });
  refreshStatusBar();

  wireTuiHandlers({
    ui,
    runner,
    sessionState,
    projectMarchDir,
    refreshStatusBar,
    isTurnRunning: () => turnRunning,
    modeState,
  });

  // Wire back-reference for skill tools → engine
  skillState.engine = runner.engine;
  activateStartupSkills({ skillState, skillPool, skillNames: args.skills, engine: runner.engine });

  // Resume session
  await resumeStartupSession({
    resumeId: args.resume,
    runner,
    sessionState,
    projectMarchDir,
    skillPool,
    ui,
  });
  refreshStatusBar();

  // Single-shot mode
  if (args.prompt) {
    turnRunning = true;
    try {
      await runSingleShotPrompt({
        prompt: args.prompt,
        runner,
        memoryStore,
        currentProject,
        ui,
        sessionState,
        refreshStatusBar,
        modeState,
      });
    } finally {
      turnRunning = false;
    }
    await runner.dispose();
    ui.writeln("");
    await ui.close();
    return 0;
  }

  const dumpContextPath = args.dumpContext ? relative(cwd, contextDumpRoot) : null;
  for (const line of formatStartupBanner({ cwd, modelId: runner.engine.modelId, thinkingLevel: runner.engine.thinkingLevel, mode: modeState.get(), dumpContextPath })) ui.writeln(line);
  await runInteractiveRepl({
    cwd,
    args,
    ui,
    runner,
    memoryStore,
    currentProject,
    sessionState,
    sessionsRoot,
    projectMarchDir,
    skillPool,
    skillState,
    sessionSource,
    extensionPaths,
    keybindingConfig,
    promptTemplateConfig,
    refreshStatusBar,
    setTurnRunning: (value) => { turnRunning = value; },
    modeState,
  });

  await runner.dispose();
  await ui.close();
  return 0;
}

function resolveMemoryRoot(configured, stateRoot) {
  if (configured) return resolve(String(configured));
  if (process.env.MARCH_MEMORY_ROOT) return resolve(process.env.MARCH_MEMORY_ROOT);
  return resolve(stateRoot, "March Memories");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
