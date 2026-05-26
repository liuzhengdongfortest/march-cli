import { ContextEngine } from "../../context/engine.mjs";
import { createSessionBinding } from "../session/session-binding.mjs";
import { resolveRunnerSessionOptions } from "../session/session-options.mjs";
import { createMarchPiContextExtension } from "../runner/context/pi-context-extension.mjs";
import { createMarchPiResourceLoader } from "../runtime/resource/context-resource-loader.mjs";
import { buildInitialPiPrompt, resetPiMessageHistory } from "../turn/pi-turn-context.mjs";
import { createTurnEventState, handleRunnerSessionEvent } from "../turn/turn-events.mjs";

export async function runHeadlessSubagentSession({
  cwd,
  stateRoot,
  provider,
  modelId,
  modelRegistry,
  settingsManager,
  authStorage,
  createAgentSession,
  definition,
  prompt,
  parentSessionId = null,
  namespace = "subagent",
  shellRuntime = null,
  lspService = null,
  webTools = [],
  hostedTools = {},
  logger = null,
  signal = null,
}) {
  const childEngine = new ContextEngine({
    cwd,
    provider,
    modelId,
    namespace: `${namespace}:${definition.name}`,
    shellRuntime,
    lspService,
  });
  const childBinding = createSessionBinding(null);
  let currentPrompt = "";
  const extension = createMarchPiContextExtension({
    engine: childEngine,
    sessionBinding: childBinding,
    hostedTools,
    getCurrentPrompt: () => currentPrompt,
    getContextMode: () => "rebuild",
    getFastEntry: () => null,
    logger,
  });
  const sessionOptions = resolveRunnerSessionOptions({
    cwd,
    stateRoot,
    provider,
    modelId,
    modelRegistry,
    engine: childEngine,
    ui: createSilentUi(),
    shellRuntime,
    lspService,
    webTools,
    authStorage,
    allowedToolNames: definition.tools,
    getCurrentModel: () => childBinding.get()?.model ?? null,
  });
  const resourceLoader = await createMarchPiResourceLoader({
    cwd,
    agentDir: stateRoot,
    settingsManager,
    extraOptions: { extensionFactories: [extension] },
  });
  const { session } = await createAgentSession({
    cwd,
    agentDir: stateRoot,
    ...sessionOptions,
    authStorage,
    modelRegistry,
    settingsManager,
    resourceLoader,
  });
  childBinding.set(session);

  const turnState = createTurnEventState();
  const unsubscribe = session.subscribe?.((event) => {
    handleRunnerSessionEvent(event, { ui: createSilentUi(), engine: childEngine, state: turnState });
  }) ?? (() => {});
  const abortOnSignal = () => session.abort?.();
  try {
    if (signal?.aborted) abortOnSignal();
    else signal?.addEventListener?.("abort", abortOnSignal, { once: true });
    currentPrompt = buildSubagentPrompt({ definition, prompt, parentSessionId });
    resetPiMessageHistory(session);
    await session.prompt(buildInitialPiPrompt(childEngine, currentPrompt));
    if (turnState.lastAssistantStopReason === "error") {
      throw new Error(turnState.lastAssistantErrorMessage || "Subagent model provider returned an error");
    }
    return {
      draft: turnState.draft.trim(),
      toolCalls: turnState.toolCalls,
      model: session.model ?? sessionOptions.model,
      thinkingLevel: session.thinkingLevel ?? sessionOptions.thinkingLevel,
    };
  } finally {
    signal?.removeEventListener?.("abort", abortOnSignal);
    unsubscribe();
    await session.dispose?.();
  }
}

function buildSubagentPrompt({ definition, prompt, parentSessionId }) {
  return [
    `[subagent_identity]\nname: ${definition.name}\ndescription: ${definition.description}\nparent_session_id: ${parentSessionId ?? "unknown"}`,
    `[subagent_instructions]\n${definition.prompt}`,
    `[delegated_task]\n${String(prompt ?? "").trim()}`,
  ].join("\n\n");
}

function createSilentUi() {
  return {
    turnStart: () => {},
    turnEnd: () => {},
    textDelta: () => {},
    thinkingStart: () => {},
    thinkingDelta: () => {},
    thinkingEnd: () => {},
    toolStart: () => {},
    toolEnd: () => {},
    retryStart: () => {},
    retryEnd: () => {},
    recall: () => {},
    status: () => {},
  };
}
