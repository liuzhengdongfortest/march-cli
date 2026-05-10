import { spawnSync } from "node:child_process";
import { DEFAULT_KEYBINDINGS, KEYBINDING_ACTIONS } from "./keybindings.mjs";

const HOTKEY_GROUPS = Object.freeze([
  ["Turn control", ["abort", "interrupt"]],
  ["Model and thinking", ["cycleThinking", "thinkingSelector", "modelSelector"]],
  ["Editor and output", ["externalEditor", "toggleToolOutput", "pasteImage"]],
  ["Shell drawer", ["toggleShellDrawer", "nextShell", "shellScrollUp", "shellScrollDown"]],
]);

export function parseInlineShellInput(input, lastCommand = "") {
  if (input === "!!") {
    if (!lastCommand) return { type: "error", message: "No previous inline shell command." };
    return { type: "command", command: lastCommand, repeated: true };
  }
  if (!input.startsWith("!")) return { type: "none" };
  const command = input.slice(1).trim();
  if (!command) return { type: "error", message: "Usage: ! <command>" };
  return { type: "command", command, repeated: false };
}

export function parseSkillInvocation(input) {
  const match = input.match(/^\/skill:([^\s]+)(?:\s+([\s\S]+))?$/);
  if (!match) return { type: "none" };
  return {
    type: "skill",
    name: match[1],
    prompt: (match[2] || "").trim(),
  };
}

export function runInlineShellCommand(command, { cwd = process.cwd(), ui } = {}) {
  const shell = process.platform === "win32"
    ? { bin: "powershell.exe", args: ["-NoProfile", "-Command", command] }
    : { bin: "bash", args: ["-lc", command] };
  ui?.writeln(`\x1b[2m$ ${command}\x1b[0m`);
  const result = spawnSync(shell.bin, shell.args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  if (result.stdout) {
    for (const line of result.stdout.replace(/\s+$/, "").split("\n")) {
      if (line) ui?.writeln(line);
    }
  }
  if (result.stderr) {
    for (const line of result.stderr.replace(/\s+$/, "").split("\n")) {
      if (line) ui?.writeln(`\x1b[31m${line}\x1b[0m`);
    }
  }
  if (result.error) {
    ui?.writeln(`\x1b[31mError: ${result.error.message}\x1b[0m`);
  } else if (result.status !== 0) {
    ui?.writeln(`\x1b[31mexit ${result.status}\x1b[0m`);
  }
  return result;
}

export function formatHotkeysPanel(keybindings = DEFAULT_KEYBINDINGS, diagnostics = []) {
  return [
    "Keyboard shortcuts:",
    ...formatGroupedKeybindingLines(keybindings),
    ...formatKeybindingDiagnostics(diagnostics),
    "Input prefixes:",
    "  /          Slash command autocomplete",
    "  /thinking  Cycle or list/set thinking level",
    "  @          File path autocomplete",
    "  ! cmd      Run local shell command without sending to the model",
    "  !!         Repeat previous local shell command",
  ];
}

export function formatGroupedKeybindingLines(keybindings = DEFAULT_KEYBINDINGS) {
  return HOTKEY_GROUPS.flatMap(([label, actions]) => [
    `  ${label}:`,
    ...actions.map((action) => formatKeybindingLine(action, keybindings)),
  ]);
}

function formatKeybindingLine(action, keybindings) {
  const key = keybindings[action] ?? DEFAULT_KEYBINDINGS[action];
  return `    ${key.padEnd(10, " ")} ${KEYBINDING_ACTIONS[action]}`;
}

function formatKeybindingDiagnostics(diagnostics) {
  if (!diagnostics || diagnostics.length === 0) return [];
  return [
    "Keybinding diagnostics:",
    ...diagnostics.map((diagnostic) => `  - ${diagnostic.type ?? "warning"}: ${diagnostic.message}`),
  ];
}
