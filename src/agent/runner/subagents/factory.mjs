import { createSubagentRuntime } from "../../subagents/runtime.mjs";
import { getRunnerSessionStats } from "../runner-session-state.mjs";

export function createRunnerSubagentRuntime({
  cwd,
  stateRoot,
  provider,
  modelId,
  modelRegistry,
  settingsManager,
  authStorage,
  createAgentSession,
  sessionBinding,
  getRuntimeHost,
  getCurrentModel,
  namespace,
  shellRuntime,
  lspService,
  webTools,
  hostedTools,
  logger,
}) {
  return createSubagentRuntime({
    cwd,
    stateRoot,
    provider,
    modelId,
    modelRegistry,
    settingsManager,
    authStorage,
    createAgentSession,
    getParentSessionId: () => getRunnerSessionStats(sessionBinding.get(), getRuntimeHost?.()).sessionId ?? null,
    getCurrentModel,
    namespace,
    shellRuntime,
    lspService,
    webTools,
    hostedTools,
    logger,
  });
}
