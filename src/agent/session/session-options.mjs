import { getModel } from "@earendil-works/pi-ai";
import { MARCH_BASE_TOOL_NAMES } from "../tool-names.mjs";
import { createMarchCustomTools } from "../tools.mjs";

export function resolveRunnerSessionOptions({
  cwd,
  provider,
  modelId,
  modelRegistry,
  engine,
  ui,
  memoryTools = [],
  historyStore = null,
  shellRuntime = null,
  lspService = null,
  mcpTools = [],
  webTools = [],
  lifecycle = null,
  authStorage = null,
  projectMarchDir = null,
  stateRoot = null,
  getCurrentModel = null,
}) {
  if (engine.cwd !== cwd) {
    throw new Error(`Runtime session cwd mismatch: engine=${engine.cwd}, session=${cwd}`);
  }

  const availableModels = modelRegistry.getAvailable?.() ?? [];
  const model = (provider && modelId ? modelRegistry.find(provider, modelId) : null)
    ?? availableModels[0]
    ?? (provider && modelId ? getModel(provider, modelId) : null);
  if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);

  const customTools = createMarchCustomTools({ cwd, engine, ui, memoryTools, historyStore, shellRuntime, lspService, mcpTools, webTools, lifecycle, authStorage, projectMarchDir, stateRoot, getCurrentModel: () => getCurrentModel?.() ?? model });
  const customToolNames = customTools.map((tool) => tool.name);
  const tools = [
    ...customToolNames.filter((name) => name === "read"),
    ...MARCH_BASE_TOOL_NAMES,
    ...customToolNames.filter((name) => name !== "read"),
  ];

  return {
    model,
    thinkingLevel: "medium",
    customTools,
    tools,
    scopedModels: availableModels.map((model) => ({ model })),
  };
}
