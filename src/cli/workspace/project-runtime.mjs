import { existsSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createRuntimeRunner } from "../startup/create-runtime-runner.mjs";
import { createCliShellRuntime } from "../../shell/cli-runtime.mjs";
import { createMarchAuthStorage } from "../../auth/storage.mjs";
import { discoverProjectExtensionPaths } from "../../extensions/discovery.mjs";
import { loadProjectLifecycleHookManifests } from "../../extensions/lifecycle-manifest.mjs";
import { loadKeybindings } from "../input/keybindings.mjs";
import { loadPromptTemplates } from "../input/prompt-templates.mjs";
import { loadOrCreateProjectId } from "../../workspace/project-id.mjs";

export async function createWorkspaceProjectRuntime({
  project,
  args,
  config,
  stateRoot,
  memoryRoot,
  profilePaths,
  createMemoryStore,
  provider,
  serviceTier,
  model,
  permissionMode,
  remoteMemorySources,
  createUi,
  refreshStatusBar,
  onNotificationActivation = null,
}) {
  const cwd = project.rootPath;
  const projectMarchDir = resolve(cwd, ".march");
  if (!existsSync(projectMarchDir)) mkdirSync(projectMarchDir, { recursive: true });

  const authConfig = createMarchAuthStorage({ provider: provider ?? "deepseek", providers: config.providers, cwd });
  if (!authConfig.hasAuth) throw new Error(`no providers configured for project: ${cwd}`);

  const namespace = loadOrCreateProjectId(projectMarchDir);
  const extensionPaths = [
    ...discoverProjectExtensionPaths(cwd),
    ...args.extensions.map((extensionPath) => resolve(cwd, extensionPath)),
  ];
  const lifecycleManifests = loadProjectLifecycleHookManifests(cwd);
  const keybindingConfig = loadKeybindings(cwd);
  const promptTemplateConfig = loadPromptTemplates(cwd);
  const projectShellRuntime = args.shellRuntime ? createCliShellRuntime({ cwd }) : null;
  const sessionsRoot = join(projectMarchDir, "sessions");
  const sessionState = { sessionId: Date.now().toString(36), sessionDir: null };
  sessionState.sessionDir = join(sessionsRoot, sessionState.sessionId);
  const contextDumpRoot = resolve(projectMarchDir, "context-dumps", sessionState.sessionId);
  const memoryStore = createMemoryStore();
  const ui = createUi(sessionState);
  const runner = await createRuntimeRunner({
    runnerOptions: {
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
      shellRuntime: Boolean(projectShellRuntime),
      lifecycleHooks: lifecycleManifests.hooks,
      lifecycleDiagnostics: lifecycleManifests.diagnostics,
      modelContextDumper: { enabled: args.dumpContext, rootDir: contextDumpRoot },
      remoteMemorySources,
      notificationContext: { projectId: project.projectId },
    },
    ui,
    shellRuntime: projectShellRuntime,
    refreshStatusBar,
    onNotificationActivation,
  });

  return {
    project,
    cwd,
    currentProject: basename(cwd),
    runner,
    ui,
    memoryStore,
    sessionState,
    sessionsRoot,
    projectMarchDir,
    extensionPaths,
    keybindingConfig,
    promptTemplateConfig,
    contextDumpRoot,
  };
}
