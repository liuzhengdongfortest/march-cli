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
  authStorage,
  settingsManager,
  modelRegistry,
  providers = {},
  sessionManager,
  sessionBinding,
  extensionPaths = [],
  extensionFactories = [],
  sessionBoundary,
  onRebind = null,
  createAgentSessionRuntimeImpl = createAgentSessionRuntime,
  createServices,
  createFromServices,
}) {
  if (!sessionBoundary) throw new Error("createRunnerRuntimeHost requires a session boundary");
  const baseBoundary = createRunnerSessionBoundary(sessionBoundary);
  const runtimeAuthStorage = authStorage ?? baseBoundary.infrastructure.authStorage;

  const createRuntime = createMarchRuntimeFactory({
    agentDir: stateRoot,
    authStorage: runtimeAuthStorage,
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
          ...baseBoundary.core,
          cwd: sessionCwd,
          modelRegistry: activeModelRegistry,
          getCurrentModel: baseBoundary.core.getCurrentModel ?? (() => sessionBinding.get()?.model ?? null),
        },
        capabilities: baseBoundary.capabilities,
        infrastructure: baseBoundary.infrastructure,
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
