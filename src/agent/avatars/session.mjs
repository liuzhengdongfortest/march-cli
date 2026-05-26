import { SessionManager } from "@earendil-works/pi-coding-agent";
import { ContextEngine } from "../../context/engine.mjs";
import { createSessionBinding } from "../session/session-binding.mjs";
import { resolveRunnerSessionOptions } from "../session/session-options.mjs";
import { installModelPayloadDumper } from "../model-payload-dumper.mjs";
import { createMarchPiContextExtension } from "../runner/context/pi-context-extension.mjs";
import { createMarchPiResourceLoader } from "../runtime/resource/context-resource-loader.mjs";
import { buildInitialPiPrompt, resetPiMessageHistory } from "../turn/pi-turn-context.mjs";
import { createTurnEventState, handleRunnerSessionEvent } from "../turn/turn-events.mjs";
import { createInheritedContextEngineOptions, formatParentCurrentState, restoreInheritedContext } from "./snapshot.mjs";

export async function runAvatarSession({
  cwd,
  stateRoot,
  provider,
  modelId,
  modelRegistry,
  settingsManager,
  authStorage,
  createAgentSession,
  definition,
  say = "",
  task,
  contextSnapshot = null,
  jobId = null,
  namespace = "avatar",
  shellRuntime = null,
  lspService = null,
  webTools = [],
  hostedTools = {},
  modelContextDumper = null,
  onModelPayload = null,
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
    maxTurns: definition.maxTurns,
    ...createInheritedContextEngineOptions(contextSnapshot),
  });
  restoreInheritedContext(childEngine, contextSnapshot);

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
  const budget = createAvatarBudget(definition.maxTurns);
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
    extraOptions: { extensionFactories: [extension, budget.extension] },
  });
  const { session } = await createAgentSession({
    cwd,
    agentDir: stateRoot,
    ...sessionOptions,
    authStorage,
    modelRegistry,
    settingsManager,
    resourceLoader,
    sessionManager: SessionManager.inMemory(cwd),
  });
  childBinding.set(session);
  installModelPayloadDumper(
    session,
    modelContextDumper,
    () => `avatar-${definition.name}`,
    onModelPayload,
    null,
    () => ({ avatar: definition.name, avatar_job_id: jobId, parent_session_id: contextSnapshot?.parent_session_id ?? null })
  );

  const turnState = createTurnEventState();
  const silentUi = createSilentUi();
  const unsubscribe = session.subscribe?.((event) => {
    handleRunnerSessionEvent(event, { ui: silentUi, engine: childEngine, state: turnState });
  }) ?? (() => {});
  const abortOnSignal = () => session.abort?.();
  try {
    if (signal?.aborted) abortOnSignal();
    else signal?.addEventListener?.("abort", abortOnSignal, { once: true });
    currentPrompt = buildAvatarPrompt({ definition, say, task, contextSnapshot });
    resetPiMessageHistory(session);
    await session.prompt(buildInitialPiPrompt(childEngine, currentPrompt));
    if (budget.exceeded) throw new Error(`Avatar exceeded max_turns=${definition.maxTurns}`);
    if (turnState.lastAssistantStopReason === "error") {
      throw new Error(turnState.lastAssistantErrorMessage || "Avatar model provider returned an error");
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

function buildAvatarPrompt({ definition, say, task, contextSnapshot }) {
  return [
    `[avatar_identity]\nname: ${definition.name}\ndescription: ${definition.description}\nparent_session_id: ${contextSnapshot?.parent_session_id ?? "unknown"}`,
    `[avatar_instructions]\n${definition.prompt}\n\nBudget: stop within max_turns=${definition.maxTurns} model turns.`,
    `[parent_current_state]\n${formatParentCurrentState(contextSnapshot)}`,
    `[dispatch_message]\n${String(say ?? "").trim() || "(no separate dispatch message)"}`,
    `[delegated_task]\n${String(task ?? "").trim()}`,
  ].join("\n\n");
}

function createAvatarBudget(maxTurns) {
  let providerRequests = 0;
  const budget = {
    exceeded: false,
    extension(pi) {
      pi.on("before_provider_request", (_event, ctx) => {
        providerRequests += 1;
        if (Number.isFinite(maxTurns) && providerRequests > maxTurns) {
          budget.exceeded = true;
          ctx.abort?.();
        }
        return undefined;
      });
    },
  };
  return budget;
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
