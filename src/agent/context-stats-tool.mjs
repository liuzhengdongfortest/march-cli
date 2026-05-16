import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "./tool-result.mjs";

export function createContextStatsTool({ engine }) {
  return defineTool({
    name: "context_stats",
    label: "Context Stats",
    description: "Show size statistics for the current March context layers without returning the full prompt text.",
    parameters: Type.Object({}),
    execute: async () => toolText(formatContextStats(engine), buildContextStats(engine)),
  });
}

export function buildContextStats(engine) {
  const layers = engine.buildContextLayers("");
  const contextText = layers.map((layer) => layer.text).join("\n\n");
  const layerStats = layers.map((layer) => ({
    name: layer.name,
    chars: layer.text.length,
    estimatedTokens: estimateTokens(layer.text.length),
  }));
  return {
    totalChars: contextText.length,
    estimatedTokens: estimateTokens(contextText.length),
    layers: layerStats,
    runtime: {
      turns: engine.turns?.length ?? 0,
      toolDefs: engine.toolDefs?.length ?? 0,
    },
  };
}

function formatContextStats(engine) {
  const stats = buildContextStats(engine);
  const lines = [
    "Context stats:",
    `total_chars: ${stats.totalChars}`,
    `estimated_tokens: ${stats.estimatedTokens}`,
    "",
    "Layers:",
  ];
  for (const layer of stats.layers) {
    lines.push(`- ${layer.name}: ${layer.chars} chars, ~${layer.estimatedTokens} tokens`);
  }
  lines.push(
    "",
    "Runtime:",
    `- turns: ${stats.runtime.turns}`,
    `- tool_defs: ${stats.runtime.toolDefs}`,
  );
  return lines.join("\n");
}

function estimateTokens(chars) {
  return Math.ceil(chars / 4);
}
