import { getModel } from "@mariozechner/pi-ai";
import { MARCH_BASE_TOOL_NAMES } from "./tool-names.mjs";
import { createMarchCustomTools } from "./tools.mjs";

export function resolveRunnerSessionOptions({
  cwd,
  provider,
  modelId,
  modelRegistry,
  engine,
  ui,
  memoryTools = [],
  skillTools = [],
  shellRuntime = null,
}) {
  if (engine.cwd !== cwd) {
    throw new Error(`Runtime session cwd mismatch: engine=${engine.cwd}, session=${cwd}`);
  }

  const model = modelRegistry.find(provider, modelId) ?? getModel(provider, modelId);
  if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);

  const customTools = createMarchCustomTools({ cwd, engine, ui, memoryTools, skillTools, shellRuntime });
  const tools = [...MARCH_BASE_TOOL_NAMES, ...customTools.map((tool) => tool.name)];

  return {
    model,
    thinkingLevel: "medium",
    customTools,
    tools,
  };
}
