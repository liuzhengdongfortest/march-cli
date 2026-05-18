import { homedir } from "node:os";
import { join, resolve, basename, relative } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCliArgs, showHelp } from "./cli/args.mjs";
import { createUI } from "./cli/ui.mjs";
import { createPermissionController, MODE } from "./cli/permissions.mjs";
import { loadKeybindings } from "./cli/input/keybindings.mjs";
import { createInputHistoryStore } from "./cli/input/history-store.mjs";
import { createModeState } from "./cli/input/mode-state.mjs";
import { loadPromptTemplates } from "./cli/input/prompt-templates.mjs";
import { runInteractiveRepl, runSingleShotPrompt } from "./cli/repl-loop.mjs";
import { closeMarchRuntime } from "./cli/startup/runtime-close.mjs";
import { createStatusLineUpdater } from "./cli/status-line-updater.mjs";
import { wireTuiHandlers } from "./cli/tui/tui-handlers.mjs";
import { createMarchAuthStorage } from "./auth/storage.mjs";
import { runLoginCommand } from "./auth/login-command.mjs";
import { createRuntimeRunner } from "./cli/startup/create-runtime-runner.mjs";
import { createCliShellRuntime } from "./shell/cli-runtime.mjs";
import { MarkdownMemoryStore } from "./memory/markdown-store.mjs";
import { createMarkdownMemoryTools } from "./memory/markdown-tools.mjs";
import { loadDotEnv } from "./config/dotenv.mjs";
import { loadConfig } from "./config/loader.mjs";
import { discoverProjectExtensionPaths } from "./extensions/discovery.mjs";
import { loadProjectLifecycleHookManifests } from "./extensions/lifecycle-manifest.mjs";
import { loadOrCreateProjectId, resumeStartupSession } from "./cli/startup/startup-session.mjs";
import { formatStartupBanner } from "./cli/startup/startup-banner.mjs";
import { initializeMcp } from "./mcp/index.mjs";
import { createWebToolsFromConfig } from "./web/tools.mjs";
import { createModelContextDumper } from "./debug/model-context-dumper.mjs";
import { createLogger, installProcessLogHandlers } from "./debug/logger.mjs";
import { defaultProfilePaths, ensureProfileFiles } from "./context/profiles.mjs";
import { runProviderConfigCommand } from "./provider/config-command.mjs";
import { runWebSearchConfigCommand } from "./web/config-command.mjs";
import { createDesktopTurnNotifier } from "./notification/desktop-notifier.mjs";
import { registerSuperGrokOAuthProvider } from "./supergrok/oauth-provider.mjs";
import { installNetworkEnvironment } from "./network/environment.mjs";

export async function run(argv) {
  const cwd = process.cwd();
  loadDotEnv(cwd);
  registerSuperGrokOAuthProvider();

  const args = parseCliArgs(argv);
  if (args.help) {
    showHelp();
    return 0;
  }

  const config = loadConfig(cwd);
  const useRuntimeProcess = process.env.MARCH_RUNTIME_PROCESS !== "0";
  installNetworkEnvironment(config.network);
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
  const logger = createLogger({ logDir: join(stateRoot, "logs") });
  installProcessLogHandlers(logger);
  logger.event("process.start", {
    cwd,
    argv,
    version: process.version,
    platform: process.platform,
    logPath: logger.path,
  });

  const provider = args.provider ?? config.provider ?? null;
  const serviceTier = config.serviceTier ?? null;
  const model = args.model ?? config.model ?? null;
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
  const profilePaths = defaultProfilePaths();
  ensureProfileFiles(profilePaths);
  const memoryStore = new MarkdownMemoryStore({ root: memoryRoot });
  const memoryTools = createMarkdownMemoryTools(memoryStore);
  const currentProject = basename(cwd);
  const shellRuntime = args.shellRuntime ? createCliShellRuntime({ cwd }) : null;

  const mcpInit = useRuntimeProcess
    ? { clientManager: null, mcpTools: [], mcpInjections: [], errors: [] }
    : await initializeMcp({ projectDir: cwd });
  const { clientManager: mcpClientManager, mcpTools, mcpInjections } = mcpInit;
  for (const { server, error } of mcpInit.errors) {
    if (args.json) {
      // errors will be surfaced in diagnostics via runner status
    } else {
      process.stderr.write(`[mcp] ${server}: ${error}\n`);
    }
  }

  const webTools = createWebToolsFromConfig(config);
  const turnNotifier = createDesktopTurnNotifier({
    enabled: Boolean(config.notifications?.turnEnd),
    config: config.notifications,
  });

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
    keybindings: keybindingConfig.keybindings,
    promptTemplates: promptTemplateConfig.templates,
    shellRuntime,
    historyStore: inputHistoryStore,
  });

  // Esc to abort current turn
  let turnRunning = false;
  let refreshStatusBar = null;

  const runnerOptions = {
    cwd,
    modelId: model,
    provider,
    serviceTier,
    providers: config.providers,
    config,
    stateRoot,
    memoryRoot,
    profilePaths,
    namespace,
    projectMarchDir,
    extensionPaths,
    permissionMode,
    shellRuntime: Boolean(shellRuntime),
    lifecycleHooks: lifecycleManifests.hooks,
    lifecycleDiagnostics: lifecycleManifests.diagnostics,
    modelContextDumper: {
      enabled: args.dumpContext,
      rootDir: contextDumpRoot,
    },
  };

  const runner = await createRuntimeRunner({
    useRuntimeProcess,
    runnerOptions,
    ui,
    memoryStore,
    memoryTools,
    shellRuntime,
    mcpTools,
    mcpInjections,
    mcpClientManager,
    webTools,
    usePiSessions,
    usePiRuntimeHost,
    authStorage: authConfig.authStorage,
    permissionController,
    modelContextDumper,
    turnNotifier,
    logger,
    refreshStatusBar,
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

  // Resume session
  const startupResume = await resumeStartupSession({
    resumeId: args.resume,
    runner,
    sessionState,
    projectMarchDir,
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
      await closeMarchRuntime({ runner, memoryStore, ui, logger, blankLine: true });
    }
    logger.event("process.exit", { code: 0 });
    return 0;
  }

  const dumpContextPath = args.dumpContext ? relative(cwd, contextDumpRoot) : null;
  if (startupResume.transcriptTurns?.length > 0) ui.restoreTranscript?.(startupResume.transcriptTurns);
  for (const line of formatStartupBanner({ cwd, modelId: runner.engine.modelId, thinkingLevel: runner.engine.thinkingLevel, mode: modeState.get(), dumpContextPath })) ui.writeln(line);
  try {
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
      sessionSource,
      extensionPaths,
      keybindingConfig,
      promptTemplateConfig,
      renderStartupBanner: () => formatStartupBanner({ cwd, modelId: runner.engine.modelId, thinkingLevel: runner.engine.thinkingLevel, mode: modeState.get(), dumpContextPath }),
      refreshStatusBar,
      setTurnRunning: (value) => { turnRunning = value; },
      modeState,
    });
  } finally {
    await closeMarchRuntime({ runner, memoryStore, ui, logger });
  }
  logger.event("process.exit", { code: 0 });
  return 0;
}

function resolveMemoryRoot(configured, stateRoot) {
  if (configured) return resolve(String(configured));
  if (process.env.MARCH_MEMORY_ROOT) return resolve(process.env.MARCH_MEMORY_ROOT);
  return resolve(stateRoot, "March Memories");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
