import { createAgentSessionRuntime } from "@earendil-works/pi-coding-agent";
import { createMarchRuntimeFactory } from "./runtime-factory.mjs";
import { createRuntimeHost } from "./runtime-host.mjs";
import { resolveRunnerSessionOptions } from "../session/session-options.mjs";

export async function createRunnerRuntimeHost({
  cwd,
  stateRoot,
  provider,
  modelId,
  authStorage,
  settingsManager,
  modelRegistry,
  sessionManager,
  sessionBinding,
  engine,
  ui,
  projectMarchDir = null,
  memoryTools = [],
  shellRuntime = null,
  lspService = null,
  mcpTools = [],
  webTools = [],
  permissionController = null,
  extensionPaths = [],
  onRebind = null,
  createAgentSessionRuntimeImpl = createAgentSessionRuntime,
  createServices,
  createFromServices,
}) {
  const createRuntime = createMarchRuntimeFactory({
    agentDir: stateRoot,
    authStorage,
    settingsManager,
    modelRegistry,
    createServices,
    createFromServices,
    resourceLoaderOptions: {
      additionalExtensionPaths: extensionPaths,
    },
    resolveSessionOptions: ({ cwd: sessionCwd, services }) => resolveRunnerSessionOptions({
      cwd: sessionCwd,
      provider,
      modelId,
      modelRegistry: services.modelRegistry ?? modelRegistry,
      engine,
      ui,
      memoryTools,
      shellRuntime,
      lspService,
      mcpTools,
      webTools,
      permissionController,
      authStorage,
      projectMarchDir,
    }),
  });

  const runtime = await createAgentSessionRuntimeImpl(createRuntime, {
    cwd,
    agentDir: stateRoot,
    sessionManager,
  });

  const host = createRuntimeHost({ runtime, sessionBinding, onRebind });
  if (onRebind) await onRebind(runtime.session);
  return host;
}
