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
    resolveSessionOptions: ({ cwd: sessionCwd, services }) => resolveRunnerSessionOptions({
      cwd: sessionCwd,
      provider,
      modelId,
      modelRegistry: services.modelRegistry ?? modelRegistry,
      engine,
      ui,
      memoryTools,
      skillTools,
    }),
  });

  const runtime = await createAgentSessionRuntimeImpl(createRuntime, {
    cwd,
    agentDir: stateRoot,
    sessionManager,
  });

  return createRuntimeHost({ runtime, sessionBinding, onRebind });
}
