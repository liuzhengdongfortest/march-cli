import { join } from "node:path";
import { readdirSync } from "node:fs";
import { CombinedAutocompleteProvider } from "@earendil-works/pi-tui";

const MARCH_COMMANDS = [
  { name: "new", description: "Start a new pi session" },
  { name: "exit", description: "Exit March" },
  { name: "quit", description: "Exit March" },
  { name: "help", description: "Show available commands" },
  { name: "model", description: "Open model selector" },
  { name: "models", description: "List available models" },
  { name: "session", description: "Open previous session selector" },
  { name: "save", description: "Show auto-save status" },
  { name: "name", description: "Show or set session name" },
  { name: "copy", description: "Copy last assistant response to clipboard" },
  { name: "thinking", description: "Open thinking selector" },
  { name: "thinking list", description: "List available thinking levels" },
  { name: "mouse", description: "Toggle mouse wheel and TUI selection copy" },
  { name: "hotkeys", description: "Show keyboard shortcuts and input prefixes" },
  { name: "templates", description: "List project prompt templates" },
  { name: "export jsonl", description: "Export current session turns as JSONL" },
  { name: "export html", description: "Export current session turns as HTML" },
  { name: "export gist html", description: "Share current session HTML as a private GitHub Gist" },
  { name: "export gist jsonl", description: "Share current session JSONL as a private GitHub Gist" },
  { name: "settings", description: "Show or edit global/project settings" },
  { name: "shell", description: "List shells or inspect shell output" },
  { name: "shell spawn", description: "Start a default PTY shell" },
];

export function buildMarchCommands(promptTemplates = []) {
  const templateCommands = promptTemplates
    .map((template) => ({
      name: typeof template === "string" ? template : template.name,
      description: "Expand prompt template",
    }))
    .filter((command) => command.name && !command.name.startsWith("/"));
  return [...MARCH_COMMANDS, ...templateCommands];
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
