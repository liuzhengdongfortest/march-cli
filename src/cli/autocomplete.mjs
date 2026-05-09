import { join } from "node:path";
import { readdirSync } from "node:fs";
import { CombinedAutocompleteProvider } from "@mariozechner/pi-tui";

const MARCH_COMMANDS = [
  { name: "exit", description: "Exit March" },
  { name: "quit", description: "Exit March" },
  { name: "help", description: "Show available commands" },
  { name: "model", description: "Cycle to next available model" },
  { name: "models", description: "List available models" },
  { name: "compact", description: "Compact session context" },
  { name: "session", description: "Show session stats (tokens, cost, messages)" },
  { name: "sessions", description: "List saved sessions" },
  { name: "resume", description: "Resume a saved session by id" },
  { name: "fork", description: "Fork current session" },
  { name: "status", description: "Show current session status" },
  { name: "save", description: "Save current session" },
  { name: "pin", description: "Pin a file to context" },
  { name: "unpin", description: "Unpin a file from context" },
  { name: "pins", description: "List pinned files" },
  { name: "thinking", description: "Cycle thinking level" },
  { name: "thinking list", description: "List available thinking levels" },
  { name: "mouse", description: "Toggle mouse tracking (for text selection vs click-to-expand)" },
  { name: "hotkeys", description: "Show keyboard shortcuts and input prefixes" },
];

export function buildMarchCommands(skillPool = []) {
  const skillCommands = skillPool
    .map((skill) => ({
      name: `skill:${typeof skill === "string" ? skill : skill.name}`,
      description: typeof skill === "string" ? "Activate skill" : (skill.description || "Activate skill"),
    }))
    .filter((command) => command.name !== "skill:undefined");
  return [...MARCH_COMMANDS, ...skillCommands];
}

export class MarchAutocompleteProvider {
  constructor(commands, cwd) {
    this.base = new CombinedAutocompleteProvider(commands, cwd);
    this.cwd = cwd;
  }

  async getSuggestions(lines, cursorLine, cursorCol, options) {
    const suggestions = await this.base.getSuggestions(lines, cursorLine, cursorCol, options);
    if (suggestions) return suggestions;
    return this.getAtFileSuggestions(lines, cursorLine, cursorCol);
  }

  applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
    return this.base.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
  }

  shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
    return this.base.shouldTriggerFileCompletion(lines, cursorLine, cursorCol);
  }

  getAtFileSuggestions(lines, cursorLine, cursorCol) {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);
    const match = textBeforeCursor.match(/(?:^|[\s([{])(@[^\s]*)$/);
    if (!match) return null;

    const prefix = match[1];
    const query = prefix.slice(1);
    const displayDotSlash = query.startsWith("./");
    const normalizedQuery = query.replace(/^[.][/\\]/, "").replace(/\\/g, "/").toLowerCase();
    const items = [];
    const skip = new Set([".git", "node_modules"]);

    const walk = (dir, relative = "", depth = 0) => {
      if (items.length >= 50 || depth > 5) return;
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (items.length >= 50) return;
        if (skip.has(entry.name)) continue;
        const rel = relative ? `${relative}/${entry.name}` : entry.name;
        const isDirectory = entry.isDirectory();
        const relForMatch = rel.toLowerCase();
        if (!normalizedQuery || relForMatch.includes(normalizedQuery)) {
          const displayPath = `${displayDotSlash ? "./" : ""}${rel}${isDirectory ? "/" : ""}`;
          items.push({
            value: `@${displayPath}`,
            label: `${entry.name}${isDirectory ? "/" : ""}`,
            description: displayPath,
          });
        }
        if (isDirectory) {
          walk(join(dir, entry.name), rel, depth + 1);
        }
      }
    };

    walk(this.cwd);
    if (items.length === 0) return null;
    items.sort((a, b) => a.description.localeCompare(b.description));
    return { items, prefix };
  }
}
