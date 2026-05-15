import { formatSelectorList } from "../selector-list.mjs";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

export function parseThinkingCommand(input) {
  if (input !== "/thinking" && !input.startsWith("/thinking ")) {
    return { type: "none" };
  }
  const arg = input.slice("/thinking".length).trim();
  if (!arg) return { type: "select-interactive" };
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

export async function handleThinkingCommand(parsed, { runner, ui = null } = {}) {
  if (parsed.type === "select-interactive") {
    if (ui?.selectList) return [await selectThinkingInteractively({ runner, ui })];
    return ["Use /thinking list or run in TUI to choose a thinking level."];
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

async function selectThinkingInteractively({ runner, ui }) {
  const levels = runner.getAvailableThinkingLevels?.() || THINKING_LEVELS;
  if (levels.length === 0) return "thinking: no available levels";
  const current = runner.getThinkingLevel?.();
  const selectedIndex = Math.max(0, levels.indexOf(current));
  const item = await ui.selectList({
    items: buildThinkingSelectItems(levels, current),
    selectedIndex,
    width: 48,
  });
  if (!item) return "thinking: unchanged";
  return `thinking: ${runner.setThinkingLevel(item.level)}`;
}
