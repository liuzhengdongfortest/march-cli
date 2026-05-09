import { formatSelectorList } from "./selector-list.mjs";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

export function parseThinkingCommand(input) {
  if (input !== "/thinking" && !input.startsWith("/thinking ")) {
    return { type: "none" };
  }
  const arg = input.slice("/thinking".length).trim();
  if (!arg) return { type: "cycle" };
  if (arg === "list") return { type: "list" };
  const index = Number(arg);
  if (Number.isInteger(index) && index > 0) return { type: "select", index };
  if (THINKING_LEVELS.includes(arg)) return { type: "set", level: arg };
  return {
    type: "error",
    message: `Usage: /thinking [list|index|${THINKING_LEVELS.join("|")}]`,
  };
}

export function formatThinkingLevels(levels, current) {
  const available = Array.isArray(levels) && levels.length > 0 ? levels : THINKING_LEVELS;
  return formatSelectorList({
    items: available,
    currentIndex: available.indexOf(current),
    instruction: "Use /thinking <index> to select.",
  });
}

export function buildThinkingSelectItems(levels, current) {
  const available = Array.isArray(levels) && levels.length > 0 ? levels : THINKING_LEVELS;
  return available.map((level, index) => ({
    value: String(index),
    label: level,
    description: level === current ? "current" : "",
    level,
  }));
}

export function selectThinkingByIndex(index, { runner }) {
  const levels = runner.getAvailableThinkingLevels?.() || THINKING_LEVELS;
  const level = levels[index - 1];
  if (!level) return `Error: thinking index out of range: ${index}`;
  return `thinking: ${runner.setThinkingLevel(level)}`;
}

export function handleThinkingCommand(parsed, { runner }) {
  if (parsed.type === "cycle") {
    const level = runner.cycleThinkingLevel();
    if (!level) return ["thinking: no available levels"];
    return [`thinking: ${level}`];
  }
  if (parsed.type === "list") {
    return formatThinkingLevels(
      runner.getAvailableThinkingLevels?.(),
      runner.getThinkingLevel?.(),
    );
  }
  if (parsed.type === "select") return [selectThinkingByIndex(parsed.index, { runner })];
  if (parsed.type === "set") {
    const level = runner.setThinkingLevel(parsed.level);
    return [`thinking: ${level}`];
  }
  if (parsed.type === "error") return [`Error: ${parsed.message}`];
  return [];
}
