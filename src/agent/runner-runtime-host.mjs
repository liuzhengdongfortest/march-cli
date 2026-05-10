import { createAgentSessionRuntime } from "@mariozechner/pi-coding-agent";
import { createMarchRuntimeFactory } from "./runtime-factory.mjs";
import { createRuntimeHost } from "./runtime-host.mjs";
import { resolveRunnerSessionOptions } from "./session-options.mjs";

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
  memoryTools = [],
  skillTools = [],
  shellRuntime = null,
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
      skillTools,
      shellRuntime,
      mcpTools,
      webTools,
      permissionController,
    }),
  });

  const runtime = await createAgentSessionRuntimeImpl(createRuntime, {
    cwd,
    agentDir: stateRoot,
    sessionManager,
  });

  return createRuntimeHost({ runtime, sessionBinding, onRebind });
}
