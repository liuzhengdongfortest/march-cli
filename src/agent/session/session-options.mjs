import { getModel } from "@earendil-works/pi-ai";
import { MARCH_BASE_TOOL_NAMES } from "../tool-names.mjs";
import { createMarchCustomTools } from "../tools.mjs";
import { createRunnerSessionBoundary } from "./session-boundary.mjs";

export function resolveRunnerSessionOptions(options = {}) {
  const boundary = createRunnerSessionBoundary(options);
  const { cwd, provider, modelId, modelRegistry, engine, ui, stateRoot, getCurrentModel, allowedToolNames } = boundary.core;
  if (engine.cwd !== cwd) {
    throw new Error(`Runtime session cwd mismatch: engine=${engine.cwd}, session=${cwd}`);
  }

  const availableModels = modelRegistry.getAvailable?.() ?? [];
  const model = (provider && modelId ? modelRegistry.find(provider, modelId) : null)
    ?? availableModels[0]
    ?? (provider && modelId ? getModel(provider, modelId) : null);
  if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);

  const allCustomTools = createMarchCustomTools({
    core: { cwd, engine, ui, stateRoot, modelRegistry, getCurrentModel: () => getCurrentModel?.() ?? model },
    capabilities: boundary.capabilities,
    infrastructure: boundary.infrastructure,
  });
  const allowed = allowedToolNames ? new Set(allowedToolNames) : null;
  const customTools = allowed ? allCustomTools.filter((tool) => allowed.has(tool.name)) : allCustomTools;
  const customToolNames = customTools.map((tool) => tool.name);
  const tools = [
    ...customToolNames.filter((name) => name === "read"),
    ...MARCH_BASE_TOOL_NAMES.filter((name) => !allowed || allowed.has(name)),
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
