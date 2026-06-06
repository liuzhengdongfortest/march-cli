import { createAgentSessionRuntime } from "@earendil-works/pi-coding-agent";
import { createMarchRuntimeFactory } from "./runtime-factory.mjs";
import { createRuntimeHost } from "./runtime-host.mjs";
import { resolveRunnerSessionOptions } from "../session/session-options.mjs";
import { createRunnerSessionBoundary } from "../session/session-boundary.mjs";
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
  avatarRuntime = null,
  imageModel = null,
  extensionPaths = [],
  hostedTools = {},
  extensionFactories = [],
  sessionBoundary = null,
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
      extensionFactories,
    },
    resolveSessionOptions: ({ cwd: sessionCwd, services }) => {
      const activeModelRegistry = services.modelRegistry ?? modelRegistry;
      registerSuperGrokProvider(activeModelRegistry);
      registerCustomProviders(activeModelRegistry, providers);
      return resolveRunnerSessionOptions(createRunnerSessionBoundary({
        core: {
          ...(sessionBoundary?.core ?? {}),
          cwd: sessionCwd,
          provider,
          modelId,
          modelRegistry: activeModelRegistry,
          engine,
          ui,
          stateRoot,
          getCurrentModel: () => sessionBinding.get()?.model ?? null,
        },
        capabilities: sessionBoundary?.capabilities ?? { memoryTools, mcpTools, webTools, avatarRuntime, imageModel },
        infrastructure: sessionBoundary?.infrastructure ?? { historyStore, shellRuntime, lspService, lifecycle, authStorage, projectMarchDir },
      }));
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
