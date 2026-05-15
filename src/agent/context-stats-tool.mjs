import { relative } from "node:path";
import { defineTool } from "@mariozechner/pi-coding-agent";
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
  const openFiles = [...(engine.openFiles?.entries?.() ?? [])].map(([path, entry]) => ({
    path: relative(engine.cwd, path) || path,
    chars: entry.content?.length ?? 0,
    lines: entry.lineCount ?? 0,
    pinned: Boolean(entry.pinned),
  })).sort((a, b) => b.chars - a.chars);
  return {
    totalChars: contextText.length,
    estimatedTokens: estimateTokens(contextText.length),
    layers: layerStats,
    openFiles: {
      count: openFiles.length,
      largest: openFiles.slice(0, 5),
    },
    runtime: {
      pins: engine.getPins?.().length ?? engine.pins?.size ?? 0,
      turns: engine.turns?.length ?? 0,
      activeSkills: engine.skills?.length ?? 0,
      skillCatalog: engine.skillPool?.length ?? 0,
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
    `- open_files: ${stats.openFiles.count}`,
    `- pins: ${stats.runtime.pins}`,
    `- turns: ${stats.runtime.turns}`,
    `- active_skills: ${stats.runtime.activeSkills}`,
    `- skill_catalog: ${stats.runtime.skillCatalog}`,
    `- tool_defs: ${stats.runtime.toolDefs}`,
  );
  if (stats.openFiles.largest.length > 0) {
    lines.push("", "Largest open files:");
    for (const file of stats.openFiles.largest) {
      lines.push(`- ${file.path}: ${file.chars} chars, ${file.lines} lines${file.pinned ? ", pinned" : ""}`);
    }
  }
  return lines.join("\n");
}

function estimateTokens(chars) {
  return Math.ceil(chars / 4);
}
