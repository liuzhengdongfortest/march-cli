import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createMarchAuthStorage } from "../auth/storage.mjs";
import { createRuntimeRunner } from "../cli/startup/create-runtime-runner.mjs";
import { createCliShellRuntime } from "../shell/cli-runtime.mjs";
import { MarkdownMemoryStore } from "../memory/markdown-store.mjs";
import { startSemanticMemoryRecallPreload } from "../memory/markdown/semantic-preload.mjs";
import { resolveMemoryRoot } from "../memory/root.mjs";
import { defaultProfilePaths, ensureProfileFiles } from "../context/profiles.mjs";
import { loadOrCreateProjectId } from "../cli/startup/startup-session.mjs";
import { createLogger, installProcessLogHandlers } from "../debug/logger.mjs";
import { discoverProjectExtensionPaths } from "../extensions/discovery.mjs";
import { loadProjectLifecycleHookManifests } from "../extensions/lifecycle-manifest.mjs";
import { normalizeRemoteMemorySources } from "../memory/remote/config.mjs";
import { prepareTurnInput } from "../cli/turn/turn-input-preparer.mjs";

const MAX_WORKSPACE_DEPTH = 3;
const MAX_WORKSPACE_ENTRIES = 200;

export async function createWebRuntimeHost({ args, config, cwd, stateRoot } = {}) {
  stateRoot ??= join(homedir(), ".march");
  if (!existsSync(stateRoot)) mkdirSync(stateRoot, { recursive: true });
  const logger = createLogger({ logDir: join(stateRoot, "logs") });
  installProcessLogHandlers(logger);
  const provider = args.provider ?? config.provider ?? null;
  const model = args.model ?? config.model ?? null;
  const authConfig = createMarchAuthStorage({ provider: provider ?? "deepseek", providers: config.providers, cwd });
  if (!authConfig.hasAuth) throw new Error("No providers configured. Run: march provider --config");

  const projectMarchDir = resolve(cwd, ".march");
  if (!existsSync(projectMarchDir)) mkdirSync(projectMarchDir, { recursive: true });
  const memoryRoot = resolveMemoryRoot(config.memoryRoot, stateRoot);
  const profilePaths = defaultProfilePaths();
  ensureProfileFiles(profilePaths);

  const memoryStore = new MarkdownMemoryStore({ root: memoryRoot, stateRoot });
  const remoteMemorySources = normalizeRemoteMemorySources(config);
  const shellRuntime = args.shellRuntime ? createCliShellRuntime({ cwd }) : null;
  const extensionPaths = discoverProjectExtensionPaths(cwd);
  const lifecycleManifests = loadProjectLifecycleHookManifests(cwd);
  const contextDumpRoot = resolve(projectMarchDir, "context-dumps", Date.now().toString(36));
  const ui = createHeadlessWebUi();
  const currentProject = basename(cwd);
  const namespace = loadOrCreateProjectId(projectMarchDir);
  const runnerOptions = {
    cwd,
    modelId: model,
    provider,
    serviceTier: config.serviceTier ?? null,
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
  };
  const runner = await createRuntimeRunner({
    runnerOptions,
    ui,
    shellRuntime,
  });
  startSemanticMemoryRecallPreload({ memoryStore, logger, delayMs: 1000 });
  let turnRunning = false;

  return {
    runner,
    memoryStore,
    logger,
    currentProject,
    snapshot: () => createWebSnapshot({ cwd, runner, currentProject }),
    subscribe: (listener) => runner.runtimeUiEvents.on(listener),
    refreshProviderQuota: () => runner.getProviderQuotaSnapshot?.({ emit: true }) ?? null,
    async runTurn(prompt) {
      if (turnRunning) throw new Error("A turn is already running");
      turnRunning = true;
      memoryStore.beginTurn();
      try {
        const input = await prepareTurnInput({ prompt, runner, memoryStore, currentProject });
        runner.runtimeUiEvents.emit({ type: "web_user_message", text: input.userMessage });
        runner.runtimeUiEvents.emit({ type: "recall", hints: input.userRecallHints, report: input.userRecallReport });
        const result = await runner.runTurn(input.fullPrompt, input.userMessage, input.runOptions);
        return result;
      } finally {
        turnRunning = false;
        memoryStore.endTurn();
      }
    },
    abort: () => runner.abort(),
    async dispose() {
      await runner.dispose?.();
      memoryStore.close?.();
    },
  };
}

export function createHeadlessWebUi() {
  return {
    readline: () => Promise.resolve(null), write: () => {}, writeln: () => {},
    thinkingStart: () => {}, thinkingDelta: () => {}, thinkingEnd: () => {},
    thinkingBlock: () => {}, toggleLastThinking: () => false,
    toolStart: () => {}, toolEnd: () => {}, textDelta: () => {},
    assistantReplyEnd: () => {}, status: () => {}, recall: () => {},
    providerQuotaSnapshot: () => {},
    clearOutput: () => {}, restoreTranscript: () => {}, setStatusBar: () => {},
    turnStart: () => {}, turnEnd: () => {}, retryStart: () => {}, retryEnd: () => {},
    editDiff: () => {},
    setEscapeHandler: () => {}, setCtrlCHandler: () => {}, setShiftTabHandler: () => {},
    setCtrlTHandler: () => {}, setCtrlLHandler: () => {}, setPasteImageHandler: () => {},
    getInputText: () => "", insertTextAtCursor: () => {}, openExternalEditor: () => {},
    toggleToolOutput: () => false, requestExit: () => {}, close: () => {},
  };
}

export function createWebSnapshot({ cwd, runner, currentProject = basename(cwd) }) {
  const model = runner.getCurrentModel?.();
  return {
    workspace: readWorkspaceTree(cwd),
    timeline: { title: currentProject, meta: runtimeMeta(model), events: [] },
    providerQuota: runner.getCachedProviderQuotaSnapshot?.() ?? null,
    sessions: [{ id: "current", title: runner.engine?.sessionName ?? currentProject, time: "now", active: true }],
    activity: [{ id: "runtime", action: "runner connected", time: "now" }],
    composer: { mode: "Chat", placeholder: "Message March…" },
  };
}

function runtimeMeta(model) {
  return [model?.provider, model?.id].filter(Boolean).join(" · ") || "runner connected";
}

function readWorkspaceTree(rootPath) {
  let count = 0;
  const rootName = basename(rootPath) || rootPath;
  return readNode(rootPath, rootName, 0, true);

  function readNode(path, name, depth, selected = false) {
    const stat = safeStat(path);
    const kind = stat?.isDirectory() ? "folder" : "file";
    const node = { id: path, name, kind, selected };
    if (kind !== "folder" || depth >= MAX_WORKSPACE_DEPTH || count >= MAX_WORKSPACE_ENTRIES) return node;
    const children = safeReadDir(path)
      .filter((entry) => !entry.name.startsWith(".git") && entry.name !== "node_modules")
      .sort(compareEntries)
      .slice(0, 80)
      .map((entry) => {
        count += 1;
        return readNode(join(path, entry.name), entry.name, depth + 1);
      });
    if (children.length > 0) node.children = children;
    return node;
  }
}

function safeStat(path) {
  try { return statSync(path); } catch { return null; }
}

function safeReadDir(path) {
  try { return readdirSync(path, { withFileTypes: true }); } catch { return []; }
}

function compareEntries(a, b) {
  if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
  return a.name.localeCompare(b.name);
}
