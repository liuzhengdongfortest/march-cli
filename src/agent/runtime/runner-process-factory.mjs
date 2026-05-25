import { join } from "node:path";
import { createRunner } from "../runner.mjs";
import { createRemoteRuntimeUiClient } from "./remote-ui-client.mjs";
import { createMarchAuthStorage } from "../../auth/storage.mjs";
import { createCliShellRuntime } from "../../shell/cli-runtime.mjs";
import { MarkdownMemoryStore } from "../../memory/markdown-store.mjs";
import { createMarkdownMemoryTools } from "../../memory/markdown-tools.mjs";
import { normalizeRemoteMemorySources } from "../../memory/remote/config.mjs";
import { initializeMcp } from "../../mcp/index.mjs";
import { createWebToolsFromConfig } from "../../web/tools.mjs";
import { resolvePiSessionManager } from "../../session/pi-manager.mjs";
import { createModelContextDumper } from "../../debug/model-context-dumper.mjs";
import { createLogger, installProcessLogHandlers } from "../../debug/logger.mjs";
import { createDesktopTurnNotifier } from "../../notification/desktop-notifier.mjs";
import { installNetworkEnvironment } from "../../network/environment.mjs";

const DEFAULT_DEPS = {
  createRunner,
  createRemoteRuntimeUiClient,
  createCliShellRuntime,
  MarkdownMemoryStore,
  createMarkdownMemoryTools,
  initializeMcp,
  createWebToolsFromConfig,
  resolvePiSessionManager,
  createModelContextDumper,
  createMarchAuthStorage,
  createLogger,
  installProcessLogHandlers,
  createDesktopTurnNotifier,
  installNetworkEnvironment,
};

export async function createIsolatedRunner(options = {}, deps = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  d.installNetworkEnvironment(options.config?.network);

  const ui = d.createRemoteRuntimeUiClient(d.peer);
  const memoryStore = new d.MarkdownMemoryStore({ root: options.memoryRoot });
  const remoteMemorySources = normalizeRemoteMemorySources({ remoteMemories: options.remoteMemorySources ?? options.config?.remoteMemories ?? [] });
  const memoryTools = d.createMarkdownMemoryTools(memoryStore, { remoteSources: remoteMemorySources });
  const shellRuntime = options.shellRuntime ? d.createCliShellRuntime({ cwd: options.cwd }) : null;
  const mcpInit = await d.initializeMcp({ projectDir: options.cwd });
  const logDir = options.logDir ?? (options.stateRoot ? join(options.stateRoot, "logs") : undefined);
  const logger = d.createLogger({ logDir });
  d.installProcessLogHandlers(logger);

  const runner = await d.createRunner({
    cwd: options.cwd,
    modelId: options.modelId,
    provider: options.provider,
    serviceTier: options.serviceTier,
    providers: options.providers,
    stateRoot: options.stateRoot,
    ui,
    memoryRoot: options.memoryRoot,
    profilePaths: options.profilePaths,
    memoryStore,
    memoryTools,
    remoteMemorySources,
    shellRuntime,
    mcpTools: mcpInit.mcpTools,
    mcpInjections: mcpInit.mcpInjections,
    mcpClientManager: mcpInit.clientManager,
    webTools: d.createWebToolsFromConfig(options.config ?? {}),
    namespace: options.namespace,
    projectMarchDir: options.projectMarchDir,
    extensionPaths: options.extensionPaths ?? [],
    sessionManager: d.resolvePiSessionManager({
      cwd: options.cwd,
      projectMarchDir: options.projectMarchDir,
      enabled: true,
    }),
    useRuntimeHost: true,
    syncPiSidecar: true,
    lifecycleHooks: options.lifecycleHooks ?? [],
    lifecycleDiagnostics: options.lifecycleDiagnostics ?? [],
    authStorage: d.createMarchAuthStorage({
      provider: options.provider ?? "deepseek",
      providers: options.providers,
      cwd: options.cwd,
    }).authStorage,
    maxTurns: options.config?.maxTurns ?? undefined,
    trimBatch: options.config?.trimBatch ?? undefined,
    hostedTools: options.config?.hostedTools,
    notificationContext: options.notificationContext,
    modelContextDumper: d.createModelContextDumper(options.modelContextDumper ?? { enabled: false }),
    turnNotifier: d.createDesktopTurnNotifier({
      enabled: Boolean(options.config?.notifications?.turnEnd),
      config: options.config?.notifications,
      onActivation: (activation) => d.peer.notify("notificationActivation", activation),
    }),
    logger,
    onModelPayload: (event) => d.peer.notify("modelPayload", pickModelPayloadEvent(event)),
    onLspStatusChange: (event) => d.peer.notify("lspStatusChange", pickLspStatusEvent(event)),
  });

  const originalDispose = runner.dispose;
  runner.dispose = async () => {
    try {
      await originalDispose.call(runner);
    } finally {
      memoryStore.close?.();
    }
  };
  return runner;
}

function pickModelPayloadEvent({ estimatedTokens, provider, model, kind, turnId } = {}) {
  return { estimatedTokens, provider, model, kind, turnId };
}

function pickLspStatusEvent({ id, root, status, reason, managed } = {}) {
  return { id, root, status, reason, managed };
}
