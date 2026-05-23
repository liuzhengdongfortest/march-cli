import { CombinedAutocompleteProvider } from "@earendil-works/pi-tui";
import { getAutocompleteCommands } from "../commands/catalog/visible-commands.mjs";
import { FileSearchIndex } from "./file-search/index.mjs";

export function buildMarchCommands(promptTemplates = []) {
  const templateCommands = promptTemplates
    .map((template) => ({
      name: typeof template === "string" ? template : template.name,
      description: "Expand prompt template",
    }))
    .filter((command) => command.name && !command.name.startsWith("/"));
  return [...getAutocompleteCommands(), ...templateCommands];
}

export class MarchAutocompleteProvider {
  constructor(commands, cwd) {
    this.base = new CombinedAutocompleteProvider(commands, cwd);
    this.fileSearchIndex = new FileSearchIndex(cwd);
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

  async getAtFileSuggestions(lines, cursorLine, cursorCol) {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);
    const match = textBeforeCursor.match(/(?:^|[\s([{])(@[^\s]*)$/);
    if (!match) return null;

    const prefix = match[1];
    const query = prefix.slice(1);
    const items = await this.fileSearchIndex.search(query, {
      limit: 50,
      displayDotSlash: query.startsWith("./"),
    });
    if (items.length === 0) return null;
    return { items, prefix };
  }
}
