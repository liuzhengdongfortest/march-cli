import { basename, join, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { createUI } from "../ui.mjs";
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
import { discoverProjectExtensionPaths } from "../../extensions/discovery.mjs";
import { loadProjectLifecycleHookManifests } from "../../extensions/lifecycle-manifest.mjs";
import { loadOrCreateProjectId, resumeStartupSession } from "./startup-session.mjs";
import { createLogger, installProcessLogHandlers } from "../../debug/logger.mjs";
import { defaultProfilePaths, ensureProfileFiles } from "../../context/profiles.mjs";
import { normalizeRemoteMemorySources } from "../../memory/remote/config.mjs";
import { resolveMemoryRoot } from "../../memory/root.mjs";
import { ensureBrowserDaemon } from "../../browser/client/lifecycle.mjs";
import { registerProject } from "../../workspace/project-registry.mjs";
import { listWorkspaceSessions } from "../../workspace/session-index.mjs";
import { createWorkspaceSessionSupervisor } from "../../workspace/supervisor.mjs";
import { createWorkspaceProjectRuntime } from "../workspace/project-runtime.mjs";
import { createWorkspaceOutputRouter } from "../workspace/output-router.mjs";
import { syncRuntimeSessionStateFromRunner } from "../workspace/runtime-session-state.mjs";
import { loadMarchSessionRenderTimeline, saveMarchSessionRenderTimeline } from "../../session/state/march-session-ui-state.mjs";

export async function createCliAppRuntime({ args, config, cwd, argv, stateRoot } = {}) {
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
  const currentProjectInfo = registerProject({ stateRoot, rootPath: cwd });
  const projectMarchDirs = new Map([[currentProjectInfo.projectId, projectMarchDir]]);
  const memoryRoot = resolveMemoryRoot(config.memoryRoot, stateRoot);
  const profilePaths = defaultProfilePaths();
  ensureProfileFiles(profilePaths);
  const memoryStore = new MarkdownMemoryStore({ root: memoryRoot, stateRoot });
  const remoteMemorySources = normalizeRemoteMemorySources(config);
  const currentProject = basename(cwd);
  const shellRuntime = args.shellRuntime ? createCliShellRuntime({ cwd }) : null;

  const sessionSource = "pi";
  const sessionsRoot = join(projectMarchDir, "sessions");
  const sessionState = {
    sessionId: args.resume ?? Date.now().toString(36),
    sessionDir: null,
  };
  sessionState.sessionDir = join(sessionsRoot, sessionState.sessionId);
  const contextDumpRoot = resolve(projectMarchDir, "context-dumps", sessionState.sessionId);

  const ui = createUI({
    json: args.json,
    cwd,
    keybindings: keybindingConfig.keybindings,
    promptTemplates: promptTemplateConfig.templates,
    shellRuntime,
    historyStore: inputHistoryStore,
  });
  const outputRouter = createWorkspaceOutputRouter({
    ui,
    activeProjectId: currentProjectInfo.projectId,
    activeSessionId: sessionState.sessionId,
    onPersistRenderTimeline: persistRenderTimeline,
  });
  const runtimeUi = outputRouter.createProjectUi(currentProjectInfo.projectId, () => sessionState.sessionId);
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
    shellRuntime: Boolean(shellRuntime),
    lifecycleHooks: lifecycleManifests.hooks,
    lifecycleDiagnostics: lifecycleManifests.diagnostics,
    modelContextDumper: { enabled: args.dumpContext, rootDir: contextDumpRoot },
    remoteMemorySources,
    notificationContext: { projectId: currentProjectInfo.projectId },
  };

  let runner;
  let workspaceSupervisor = null;
  const onNotificationActivation = (activation) => {
    handleNotificationActivation({ activation, stateRoot, workspaceSupervisor, ui }).catch((err) => ui.writeln(`Notification activation failed: ${err.message}`));
  };
  try {
    runner = await createRuntimeRunner({
      runnerOptions,
      ui: runtimeUi,
      shellRuntime,
      refreshStatusBar: (...args) => refreshStatusBar?.(...args),
      onNotificationActivation,
    });
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    logger.error("runtime.start_failed", { error: err });
    memoryStore.close?.();
    return { ok: false, code: 1, logger };
  }
  syncRuntimeSessionStateFromRunner(sessionState, runner, sessionsRoot);

  const initialRuntime = {
    project: currentProjectInfo,
    cwd,
    currentProject,
    runner,
    ui: runtimeUi,
    memoryStore,
    sessionState,
    sessionsRoot,
    projectMarchDir,
    extensionPaths,
    keybindingConfig,
    promptTemplateConfig,
  };
  workspaceSupervisor = createWorkspaceSessionSupervisor({
    initialRuntime,
    createProjectRuntime: (project) => {
      projectMarchDirs.set(project.projectId, resolve(project.rootPath, ".march"));
      return createWorkspaceProjectRuntime({
        project,
        args,
        config,
        stateRoot,
        memoryRoot,
        profilePaths,
        createMemoryStore: () => new MarkdownMemoryStore({ root: memoryRoot, stateRoot }),
        provider,
        serviceTier,
        model,
        remoteMemorySources,
        createUi: (runtimeSessionState) => outputRouter.createProjectUi(project.projectId, () => runtimeSessionState.sessionId),
        refreshStatusBar: (...args) => refreshStatusBar?.(...args),
        onNotificationActivation,
      });
    },
    onActivate: ({ projectId, sessionId, runtime }) => {
      if (runtime?.projectMarchDir) projectMarchDirs.set(projectId, runtime.projectMarchDir);
      outputRouter.setActiveSession(projectId, sessionId, { renderTimeline: loadStoredRenderTimeline(projectMarchDirs.get(projectId), sessionId) });
    },
  });
  runner = workspaceSupervisor.runner;

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
  workspaceSupervisor.refreshActiveRuntime();
  outputRouter.setActiveSession(currentProjectInfo.projectId, sessionState.sessionId, { renderTimeline: loadStoredRenderTimeline(projectMarchDir, sessionState.sessionId) });
  refreshStatusBar();

  function persistRenderTimeline({ projectId, sessionId, events }) {
    if (!sessionId) return;
    const routeProjectMarchDir = projectMarchDirs.get(projectId);
    if (!routeProjectMarchDir) return;
    try {
      saveMarchSessionRenderTimeline({ projectMarchDir: routeProjectMarchDir, sessionId, renderTimeline: events });
    } catch {
      // Render persistence is separate from model context; a UI write failure must not corrupt the turn.
    }
  }

  return {
    ok: true,
    args,
    cwd,
    ui,
    runner,
    workspaceSupervisor,
    workspaceOutputRouter: outputRouter,
    memoryStore,
    currentProject,
    currentProjectInfo,
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
function loadStoredRenderTimeline(projectMarchDir, sessionId) {
  if (!projectMarchDir || !sessionId) return null;
  try {
    return loadMarchSessionRenderTimeline({ projectMarchDir, sessionId })?.renderTimeline ?? null;
  } catch {
    return null;
  }
}

async function handleNotificationActivation({ activation, stateRoot, workspaceSupervisor, ui }) {
  if (activation?.type !== "workspace-session" || !activation.projectId) return;
  if (!workspaceSupervisor) throw new Error("workspace supervisor is not ready");
  const projects = await listWorkspaceSessions({ stateRoot, currentProjectId: workspaceSupervisor.getActive?.()?.project?.projectId ?? null });
  const runtime = await workspaceSupervisor.activateWorkspaceSessionById({
    projects,
    projectId: activation.projectId,
    sessionId: activation.sessionId,
  });
  ui.writeln(`Activated session from notification: ${runtime.project.displayName}`);
}