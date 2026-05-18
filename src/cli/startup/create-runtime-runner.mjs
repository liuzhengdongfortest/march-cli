import { createRunner } from "../../agent/runner.mjs";
import { createRunnerProcessClient } from "../../agent/runtime/runner-process-client.mjs";
import { resolvePiSessionManager } from "../../session/pi-manager.mjs";

export async function createRuntimeRunner({
  useRuntimeProcess = false,
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
  authStorage,
  permissionController,
  modelContextDumper,
  turnNotifier,
  logger,
  refreshStatusBar,
} = {}) {
  const runner = useRuntimeProcess
    ? (await createRunnerProcessClient({ runnerOptions, ui })).runner
    : await createRunner({
      ...runnerOptions,
      ui,
      memoryStore,
      memoryTools,
      shellRuntime,
      mcpTools,
      mcpInjections,
      mcpClientManager,
      webTools,
      sessionManager: resolvePiSessionManager({
        cwd: runnerOptions.cwd,
        projectMarchDir: runnerOptions.projectMarchDir,
        enabled: usePiSessions,
      }),
      useRuntimeHost: usePiRuntimeHost,
      syncPiSidecar: usePiSessions || usePiRuntimeHost,
      authStorage,
      maxTurns: runnerOptions.config?.maxTurns ?? undefined,
      trimBatch: runnerOptions.config?.trimBatch ?? undefined,
      hostedTools: runnerOptions.config?.hostedTools,
      permissionController,
      modelContextDumper,
      turnNotifier,
      logger,
      onModelPayload: ({ estimatedTokens }) => {
        refreshStatusBar?.({ contextTokens: estimatedTokens });
      },
    });

  runner.shellRuntime ??= shellRuntime;
  return runner;
}
