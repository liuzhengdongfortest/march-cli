const VISIBLE_COMMANDS = [
  { name: "new", description: "Start a new pi session" },
  { name: "reload", aliases: ["reload-runtime"], description: "Restart the March runtime" },
  { name: "exit", aliases: ["quit"], description: "Exit March" },
  { name: "help", description: "Show available commands" },
  { name: "hotkeys", description: "Show keyboard shortcuts and input prefixes" },
  { name: "templates", description: "List project prompt templates" },
  { name: "do", description: "Switch to Do mode" },
  { name: "discuss", description: "Switch to Discuss mode" },
  { name: "mode", description: "Show current mode" },
  { name: "thinking", description: "Open thinking selector" },
  { name: "thinking list", description: "List available thinking levels" },
  { name: "export jsonl", description: "Export current session turns as JSONL" },
  { name: "export html", description: "Export current session turns as HTML" },
  { name: "export gist jsonl", helpSyntax: "export gist <jsonl|html>", description: "Share current session JSONL as a private GitHub Gist" },
  { name: "export gist html", help: false, description: "Share current session HTML as a private GitHub Gist" },
  { name: "settings", description: "Show or edit global/project settings" },
  { name: "extensions", description: "List extension paths" },
  { name: "providers", description: "List configured providers" },
  { name: "model", description: "Open model selector" },
  { name: "session", description: "Open previous session selector" },
  { name: "status", description: "Show runtime status" },
  { name: "shell", description: "List shells or inspect shell output" },
  { name: "shell spawn", helpSyntax: "shell spawn [name]", description: "Start a default PTY shell" },
  { name: "save", description: "Show auto-save status" },
  { name: "name", description: "Show or set session name" },
  { name: "copy", description: "Copy last assistant response to clipboard" },
];

export function getVisibleCommandEntries() {
  return VISIBLE_COMMANDS.map((command) => ({ ...command }));
}

export function getAutocompleteCommands() {
  return VISIBLE_COMMANDS.flatMap((command) => [command.name, ...(command.aliases ?? [])]
    .map((name) => ({ name, description: command.description })));
}

export function getHelpCommandSyntaxes() {
  return VISIBLE_COMMANDS
    .filter((command) => command.help !== false)
    .map((command) => `/${command.helpSyntax ?? command.name}`);
}
