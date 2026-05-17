import { createImageGenTool } from "./tool.mjs";

export function initImageGen({ authStorage, projectMarchDir }) {
  const credentials = authStorage?.get?.("openai-codex");
  if (!credentials) return [];
  return [createImageGenTool({ authStorage, projectMarchDir })];
}
