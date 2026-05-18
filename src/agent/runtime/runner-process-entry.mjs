import { join } from "node:path";
import { createRunner } from "../runner.mjs";
import { createProcessRuntimeIpcPeer } from "./ipc/process-ipc-transport.mjs";
import { createRemoteRuntimeUiClient } from "./remote-ui-client.mjs";
import { createRunnerIpcTarget } from "./runner-ipc-target.mjs";
import { createMarchAuthStorage } from "../../auth/storage.mjs";
import { createCliShellRuntime } from "../../shell/cli-runtime.mjs";
import { MarkdownMemoryStore } from "../../memory/markdown-store.mjs";
import { createMarkdownMemoryTools } from "../../memory/markdown-tools.mjs";
import { initializeMcp } from "../../mcp/index.mjs";
import { createWebToolsFromConfig } from "../../web/tools.mjs";
import { createPermissionController } from "../../cli/permissions.mjs";
import { resolvePiSessionManager } from "../../session/pi-manager.mjs";
import { createModelContextDumper } from "../../debug/model-context-dumper.mjs";
import { createLogger, installProcessLogHandlers } from "../../debug/logger.mjs";
import { createDesktopTurnNotifier } from "../../notification/desktop-notifier.mjs";

const peer = createProcessRuntimeIpcPeer({
  target: createRunnerIpcTarget({ createRunnerImpl: createIsolatedRunner }),
});

process.once("disconnect", () => peer.dispose());

async function createIsolatedRunner(options = {}) {
  const ui = createRemoteRuntimeUiClient(peer);
  const memoryStore = new MarkdownMemoryStore({ root: options.memoryRoot });
  const memoryTools = createMarkdownMemoryTools(memoryStore);
  const shellRuntime = options.shellRuntime ? createCliShellRuntime({ cwd: options.cwd }) : null;
  const mcpInit = await initializeMcp({ projectDir: options.cwd });
  const logger = createLogger({ logDir: options.logDir ?? (options.stateRoot ? join(options.stateRoot, "logs") : undefined) });
  installProcessLogHandlers(logger);

  const runner = await createRunner({
    cwd: options.cwd,
    modelId: options.modelId,
    provider: options.provider,
    serviceTier: options.serviceTier,
    providers: options.providers,
    stateRoot: options.stateRoot,
    ui,
    memoryRoot: options.memoryRoot,
    centerMemoryPath: options.centerMemoryPath,
    memoryStore,
    memoryTools,
    shellRuntime,
    mcpTools: mcpInit.mcpTools,
    mcpInjections: mcpInit.mcpInjections,
    mcpClientManager: mcpInit.clientManager,
    webTools: createWebToolsFromConfig(options.config ?? {}),
    namespace: options.namespace,
    projectMarchDir: options.projectMarchDir,
    extensionPaths: options.extensionPaths ?? [],
    sessionManager: resolvePiSessionManager({
      cwd: options.cwd,
      projectMarchDir: options.projectMarchDir,
      enabled: true,
    }),
    useRuntimeHost: true,
    syncPiSidecar: true,
    lifecycleHooks: options.lifecycleHooks ?? [],
    lifecycleDiagnostics: options.lifecycleDiagnostics ?? [],
    authStorage: createMarchAuthStorage({
      provider: options.provider ?? "deepseek",
      providers: options.providers,
      cwd: options.cwd,
    }).authStorage,
    maxTurns: options.config?.maxTurns ?? undefined,
    trimBatch: options.config?.trimBatch ?? undefined,
    hostedTools: options.config?.hostedTools,
    permissionController: createPermissionController({ mode: options.permissionMode }),
    modelContextDumper: createModelContextDumper(options.modelContextDumper ?? { enabled: false }),
    turnNotifier: createDesktopTurnNotifier({
      enabled: Boolean(options.config?.notifications?.turnEnd),
      config: options.config?.notifications,
    }),
    logger,
    onModelPayload: ({ estimatedTokens }) => ui.status?.(`context ${estimatedTokens} tokens`),
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
