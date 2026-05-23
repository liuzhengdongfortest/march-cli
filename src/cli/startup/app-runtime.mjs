import { basename, join, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { createUI } from "../ui.mjs";
import { createPermissionController, MODE } from "../permissions.mjs";
import { loadKeybindings } from "../input/keybindings.mjs";
import { createInputHistoryStore } from "../input/history-store.mjs";
import { createModeState } from "../input/mode-state.mjs";
import { loadPromptTemplates } from "../input/prompt-templates.mjs";
import { createStatusLineUpdater } from "../status-line-updater.mjs";
import { wireTuiHandlers } from "../tui/tui-handlers.mjs";
import { createMarchAuthStorage } from "../../auth/storage.mjs";
import { createRuntimeRunner } from "./create-runtime-runner.mjs";
import { createCliShellRuntime } from "../../shell/cli-runtime.mjs";
import { MarkdownMemoryStore } from "../../memory/markdown-store.mjs";
import { createMarkdownMemoryTools } from "../../memory/markdown-tools.mjs";
import { discoverProjectExtensionPaths } from "../../extensions/discovery.mjs";
import { loadProjectLifecycleHookManifests } from "../../extensions/lifecycle-manifest.mjs";
import { loadOrCreateProjectId, resumeStartupSession } from "./startup-session.mjs";
import { initializeMcp } from "../../mcp/index.mjs";
import { createWebToolsFromConfig } from "../../web/tools.mjs";
import { createModelContextDumper } from "../../debug/model-context-dumper.mjs";
import { createLogger, installProcessLogHandlers } from "../../debug/logger.mjs";
import { defaultProfilePaths, ensureProfileFiles } from "../../context/profiles.mjs";
import { createDesktopTurnNotifier } from "../../notification/desktop-notifier.mjs";
import { normalizeRemoteMemorySources } from "../../memory/remote/config.mjs";
import { resolveMemoryRoot } from "../../memory/root.mjs";
import { ensureBrowserDaemon } from "../../browser/client/lifecycle.mjs";

export async function createCliAppRuntime({ args, config, cwd, argv, stateRoot, useRuntimeProcess } = {}) {
  if (!existsSync(stateRoot)) mkdirSync(stateRoot, { recursive: true });
  await ensureBrowserDaemon({ stateRoot }).catch(() => {});

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
    return { ok: false, code: 1, logger };
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
  const remoteMemorySources = normalizeRemoteMemorySources(config);
  const memoryTools = createMarkdownMemoryTools(memoryStore, { remoteSources: remoteMemorySources });
  const currentProject = basename(cwd);
  const shellRuntime = args.shellRuntime ? createCliShellRuntime({ cwd }) : null;

  const mcpInit = useRuntimeProcess
    ? { clientManager: null, mcpTools: [], mcpInjections: [], errors: [] }
    : await initializeMcp({ projectDir: cwd });
  for (const { server, error } of mcpInit.errors) {
    if (!args.json) process.stderr.write(`[mcp] ${server}: ${error}\n`);
  }

  const webTools = createWebToolsFromConfig(config);
  const turnNotifier = createDesktopTurnNotifier({ enabled: Boolean(config.notifications?.turnEnd), config: config.notifications });
  const permissionMode = args.permissionMode ?? MODE.BYPASS;
  const permissionController = createPermissionController({ mode: permissionMode });
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
    modelContextDumper: { enabled: args.dumpContext, rootDir: contextDumpRoot },
    remoteMemorySources,
  };

  let runner;
  try {
    runner = await createRuntimeRunner({
      useRuntimeProcess, runnerOptions, ui, memoryStore, memoryTools, shellRuntime,
      mcpTools: mcpInit.mcpTools, mcpInjections: mcpInit.mcpInjections, mcpClientManager: mcpInit.clientManager, webTools,
      usePiSessions, usePiRuntimeHost, authStorage: authConfig.authStorage,
      permissionController, modelContextDumper, turnNotifier, logger,
      refreshStatusBar: (...args) => refreshStatusBar?.(...args),
    });
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    logger.error("runtime.start_failed", { error: err });
    memoryStore.close?.();
    return { ok: false, code: 1, logger };
  }

  refreshStatusBar = createStatusLineUpdater({
    ui,
    runner,
    sessionState,
    sessionSource,
    getMode: () => modeState.get(),
  });
  const initialContextTokens = typeof runner.estimateContextTokens === "function"
    ? await runner.estimateContextTokens("")
    : null;
  refreshStatusBar(initialContextTokens ? { contextTokens: initialContextTokens } : undefined);

  wireTuiHandlers({
    ui,
    runner,
    sessionState,
    projectMarchDir,
    refreshStatusBar,
    isTurnRunning: () => turnRunning,
    modeState,
  });

  const startupResume = await resumeStartupSession({
    resumeId: args.resume,
    runner,
    sessionState,
    projectMarchDir,
    ui,
  });
  refreshStatusBar();

  return {
    ok: true,
    args,
    cwd,
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
    startupResume,
    contextDumpRoot,
    logger,
    modeState,
    refreshStatusBar,
    setTurnRunning(value) { turnRunning = value; },
  };
}
