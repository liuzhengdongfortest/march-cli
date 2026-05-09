const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

export function parseThinkingCommand(input) {
  if (input !== "/thinking" && !input.startsWith("/thinking ")) {
    return { type: "none" };
  }
  const arg = input.slice("/thinking".length).trim();
  if (!arg) return { type: "cycle" };
  if (arg === "list") return { type: "list" };
  if (THINKING_LEVELS.includes(arg)) return { type: "set", level: arg };
  return {
    type: "error",
    message: `Usage: /thinking [list|${THINKING_LEVELS.join("|")}]`,
  };
}

export function formatThinkingLevels(levels, current) {
  const available = Array.isArray(levels) && levels.length > 0 ? levels : THINKING_LEVELS;
  return available.map((level) => `${level === current ? "*" : " "} ${level}`);
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
  if (parsed.type === "set") {
    const level = runner.setThinkingLevel(parsed.level);
    return [`thinking: ${level}`];
  }
  if (parsed.type === "error") return [`Error: ${parsed.message}`];
  return [];
}
