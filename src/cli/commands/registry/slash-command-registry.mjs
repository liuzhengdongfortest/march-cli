import { listExtensionPathsCommand } from "../extensions-command.mjs";
import { handleExportCommand, parseExportCommand } from "../export-command.mjs";
import { handleModelCommand, parseModelCommand } from "../model-command.mjs";
import { formatHotkeysPanel } from "../../repl-commands.mjs";
import { copyLastAssistantMessage } from "../copy-command.mjs";
import { handleSessionSourceCommand } from "../../session/session-source-command.mjs";
import { statusCommand } from "../status-command.mjs";
import { handleThinkingCommand, parseThinkingCommand } from "../thinking-command.mjs";
import { formatPromptTemplateLines } from "../../input/prompt-templates.mjs";
import { handleSettingsCommand, parseSettingsCommand } from "../../../config/settings-command.mjs";
import { handleSessionNameCommand, parseSessionNameCommand } from "../../session/session-name-command.mjs";
import { handleShellCommand, parseShellCommand } from "../../shell/shell-command.mjs";
import { handleProviderCommand, parseProviderCommand } from "../provider-command.mjs";
import { handleModeCommand, parseModeCommand } from "../mode-command.mjs";

export const SLASH_COMMANDS = [
  exactCommand({
    name: "exit",
    aliases: ["quit"],
    description: "Exit March",
    run: async (ctx) => {
      await handleSessionSourceCommand("/save", ctx);
      return { handled: true, exit: true };
    },
  }),
  exactCommand({
    name: "new",
    description: "Start a new pi session",
    run: handleNewCommand,
  }),
  exactCommand({
    name: "help",
    description: "Show available commands",
    run: async ({ ui }) => writeLines(ui, formatHelpLines()),
  }),
  exactCommand({
    name: "reload",
    aliases: ["reload-runtime"],
    description: "Restart the March runtime",
    run: handleReloadCommand,
  }),
  parsedCommand({
    names: ["do", "discuss", "mode"],
    metadata: [
      { name: "do", description: "Switch to Do mode" },
      { name: "discuss", description: "Switch to Discuss mode" },
      { name: "mode", description: "Show current mode" },
    ],
    parse: parseModeCommand,
    run: async (ctx, command) => writeLines(ctx.ui, handleModeCommand(command, { modeState: ctx.modeState })),
  }),
  exactCommand({
    name: "hotkeys",
    description: "Show keyboard shortcuts and input prefixes",
    run: async ({ ui, keybindings, keybindingDiagnostics }) => writeLines(ui, formatHotkeysPanel(keybindings, keybindingDiagnostics)),
  }),
  exactCommand({
    name: "templates",
    description: "List project prompt templates",
    run: async ({ ui, promptTemplates, promptTemplateDiagnostics }) => writeLines(ui, formatPromptTemplateLines(promptTemplates, promptTemplateDiagnostics)),
  }),
  parsedCommand({
    names: ["export"],
    metadata: [
      { name: "export jsonl", description: "Export current session turns as JSONL" },
      { name: "export html", description: "Export current session turns as HTML" },
      { name: "export gist jsonl", helpSyntax: "export gist <jsonl|html>", description: "Share current session JSONL as a private GitHub Gist" },
      { name: "export gist html", help: false, description: "Share current session HTML as a private GitHub Gist" },
    ],
    parse: parseExportCommand,
    run: async (ctx, command) => writeLines(ctx.ui, await handleExportCommand(command, ctx)),
  }),
  parsedCommand({
    names: ["settings"],
    metadata: [{ name: "settings", description: "Show or edit global/project settings" }],
    parse: parseSettingsCommand,
    run: async (ctx, command) => writeLines(ctx.ui, handleSettingsCommand(command, { cwd: ctx.runner.engine.cwd, homeDir: ctx.settingsHomeDir })),
  }),
  exactCommand({
    name: "extensions",
    description: "List extension paths",
    run: async ({ ui, runner, extensionPaths }) => writeLines(ui, listExtensionPathsCommand(
      extensionPaths,
      runner.getExtensionDiagnostics?.(),
      runner.getExtensionLifecycleState?.(),
    )),
  }),
  parsedCommand({
    names: ["thinking"],
    metadata: [
      { name: "thinking", description: "Open thinking selector" },
      { name: "thinking list", description: "List available thinking levels" },
    ],
    parse: parseThinkingCommand,
    run: async (ctx, command) => writeLines(ctx.ui, await handleThinkingCommand(command, { runner: ctx.runner, ui: ctx.ui })),
  }),
  exactCommand({
    name: "status",
    description: "Show runtime status",
    run: async ({ ui, runner, sessionState, sessionSource }) => writeLines(ui, statusCommand({
      runner,
      sessionState,
      sessionSource,
      extensionDiagnostics: runner.getExtensionDiagnostics?.() ?? [],
      lifecycleState: runner.getExtensionLifecycleState?.() ?? null,
    })),
  }),
  exactCommand({
    name: "notify",
    visible: false,
    help: false,
    autocomplete: false,
    description: "Test desktop notifications",
    run: async ({ ui, runner }) => writeLines(ui, [formatNotificationResult(await runner.notifyTest?.())]),
  }),
  parsedCommand({
    names: ["shell"],
    metadata: [
      { name: "shell", description: "List shells or inspect shell output" },
      { name: "shell spawn", helpSyntax: "shell spawn [name]", description: "Start a default PTY shell" },
    ],
    parse: parseShellCommand,
    run: async (ctx, command) => writeLines(ctx.ui, handleShellCommand(command, { shellRuntime: ctx.runner.shellRuntime })),
  }),
  parsedCommand({
    names: ["name"],
    metadata: [{ name: "name", description: "Show or set session name" }],
    parse: parseSessionNameCommand,
    run: async (ctx, command) => writeLines(ctx.ui, handleSessionNameCommand(command, ctx)),
  }),
  exactCommand({
    name: "copy",
    description: "Copy last assistant response to clipboard",
    run: async ({ ui, runner, writeClipboard }) => writeLines(ui, copyLastAssistantMessage({ engine: runner.engine, writeClipboard })),
  }),
  exactCommand({
    name: "mouse",
    visible: false,
    help: false,
    autocomplete: false,
    description: "Show mouse selection status",
    run: async ({ ui }) => writeLines(ui, ["Mouse selection is always enabled."]),
  }),
  sessionSourceCommand(),
  parsedCommand({
    names: ["providers"],
    metadata: [{ name: "providers", description: "List configured providers" }],
    parse: parseProviderCommand,
    run: async (ctx, command) => {
      try {
        writeLines(ctx.ui, [await handleProviderCommand(command, { ui: ctx.ui, runner: ctx.runner })]);
      } catch (err) {
        writeLines(ctx.ui, [`Error: ${err.message}`]);
      }
      return { handled: true };
    },
  }),
  parsedCommand({
    names: ["model"],
    metadata: [{ name: "model", description: "Open model selector" }],
    parse: parseModelCommand,
    run: async (ctx, command) => {
      try {
        writeLines(ctx.ui, [await handleModelCommand(command, { runner: ctx.runner, ui: ctx.ui, configHomeDir: ctx.configHomeDir })]);
      } catch (err) {
        writeLines(ctx.ui, [`Error: ${err.message}`]);
      }
      return { handled: true };
    },
  }),
];

export async function runSlashCommand(trimmed, context) {
  for (const command of SLASH_COMMANDS) {
    const match = command.match(trimmed);
    if (!match) continue;
    return await command.run(context, match.parsed);
  }
  return { handled: false };
}

export function getVisibleCommandEntries() {
  return SLASH_COMMANDS.flatMap((command) => command.metadata ?? [])
    .filter((command) => command.visible !== false)
    .map((command) => ({ ...command }));
}

export function getAutocompleteCommands() {
  return getVisibleCommandEntries()
    .filter((command) => command.autocomplete !== false)
    .flatMap((command) => [command.name, ...(command.aliases ?? [])]
      .map((name) => ({ name, description: command.description })));
}

export function getHelpCommandSyntaxes() {
  return getVisibleCommandEntries()
    .filter((command) => command.help !== false)
    .map((command) => `/${command.helpSyntax ?? command.name}`);
}

function exactCommand({ name, aliases = [], description, visible = true, help = true, autocomplete = true, run }) {
  const names = [name, ...aliases];
  return {
    metadata: [{ name, aliases, description, visible, help, autocomplete }],
    match: (trimmed) => names.some((candidate) => trimmed === `/${candidate}`) ? { parsed: { type: name } } : null,
    run,
  };
}

function parsedCommand({ names, metadata, parse, run }) {
  return {
    metadata,
    match: (trimmed) => {
      if (!names.some((name) => trimmed === `/${name}` || trimmed.startsWith(`/${name} `))) return null;
      const parsed = parse(trimmed);
      return parsed?.type === "none" ? null : { parsed };
    },
    run,
  };
}

function sessionSourceCommand() {
  return {
    metadata: [
      { name: "session", description: "Open previous session selector" },
      { name: "save", description: "Show auto-save status" },
    ],
    match: (trimmed) => (trimmed === "/session" || trimmed === "/save") ? { parsed: { trimmed } } : null,
    run: async (ctx, { trimmed }) => handleSessionSourceCommand(trimmed, ctx),
  };
}

async function handleNewCommand({ ui, runner, renderStartupBanner }) {
  if (!runner.canSwitchPiSession?.()) {
    ui.writeln("Error: pi runtime host is not enabled");
    return { handled: true };
  }
  let refreshContextTokens = false;
  try {
    const result = await runner.startNewSession();
    if (result?.cancelled) {
      ui.writeln("New session cancelled");
    } else {
      refreshContextTokens = true;
      ui.clearOutput?.();
      const bannerLines = typeof renderStartupBanner === "function" ? renderStartupBanner() : [];
      if (bannerLines.length > 0) {
        writeLines(ui, bannerLines);
      } else {
        ui.writeln(`Started new session: ${result.sessionId}`);
      }
    }
  } catch (err) {
    ui.writeln(`Error: ${err.message}`);
  }
  return { handled: true, refreshContextTokens };
}

async function handleReloadCommand({ ui, runner }) {
  if (typeof runner.restartRuntime !== "function") {
    ui.writeln("Runtime reload is unavailable in in-process mode. Restart March to load code changes.");
    return { handled: true };
  }
  try {
    await runner.restartRuntime();
    ui.writeln("● March runtime 已重启，下一轮将使用磁盘上的最新代码");
    return { handled: true, refreshContextTokens: true };
  } catch (err) {
    ui.writeln(`Error: ${err.message}`);
    return { handled: true };
  }
}

function writeLines(ui, lines) {
  for (const line of lines) ui.writeln(line);
  return { handled: true };
}

export function formatHelpLines() {
  return [
    `Commands: ${getHelpCommandSyntaxes().join(", ")}`,
    "Sessions: /session opens previous sessions and restores the selected one.",
    "Shortcuts: Tab = toggle Do/Discuss, Esc = abort turn, Ctrl+C = abort turn / press twice to exit when idle, Ctrl+O = toggle tool output, Alt+S = shell pane, Alt+N = next shell, Alt+K/J = shell scroll, PageUp/PageDown = output scroll, Ctrl+G = external editor, Shift+Tab = thinking selector, Ctrl+T = thinking selector, Ctrl+L = model selector",
  ];
}

function formatNotificationResult(result) {
  if (!result) return "notification: unavailable";
  const channels = (result.results ?? [])
    .map((entry) => `${entry.channel}:${entry.ok ? "ok" : entry.reason ?? "failed"}`)
    .join(", ");
  return `notification: ${result.ok ? "ok" : result.reason ?? "failed"}${channels ? ` (${channels})` : ""}`;
}
