import { createAgentSessionRuntime } from "@earendil-works/pi-coding-agent";
import { createMarchRuntimeFactory } from "./runtime-factory.mjs";
import { createRuntimeHost } from "./runtime-host.mjs";
import { resolveRunnerSessionOptions } from "../session/session-options.mjs";
import { registerSuperGrokProvider } from "../../supergrok/provider.mjs";
import { registerCustomProviders } from "../../provider/custom-provider.mjs";

export async function createRunnerRuntimeHost({
  cwd,
  stateRoot,
  provider,
  modelId,
  authStorage,
  settingsManager,
  modelRegistry,
  providers = {},
  sessionManager,
  sessionBinding,
  engine,
  ui,
  projectMarchDir = null,
  memoryTools = [],
  historyStore = null,
  shellRuntime = null,
  lspService = null,
  mcpTools = [],
  webTools = [],
  lifecycle = null,
  permissionController = null,
  extensionPaths = [],
  hostedTools = {},
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
    resolveSessionOptions: ({ cwd: sessionCwd, services }) => {
      const activeModelRegistry = services.modelRegistry ?? modelRegistry;
      registerSuperGrokProvider(activeModelRegistry);
      registerCustomProviders(activeModelRegistry, providers);
      return resolveRunnerSessionOptions({
        cwd: sessionCwd,
        stateRoot,
        provider,
        modelId,
        modelRegistry: activeModelRegistry,
        engine,
        ui,
        memoryTools,
        historyStore,
        shellRuntime,
        lspService,
        mcpTools,
        webTools,
        lifecycle,
        permissionController,
        authStorage,
        projectMarchDir,
        hostedTools,
        getCurrentModel: () => sessionBinding.get()?.model ?? null,
      });
    },
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
