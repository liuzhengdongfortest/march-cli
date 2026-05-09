import { spawnSync } from "node:child_process";

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

export function formatHotkeysPanel() {
  return [
    "Keyboard shortcuts:",
    "  Esc        Abort current turn; cancel retry wait",
    "  Shift+Tab  Cycle thinking level",
    "  Ctrl+T     Open thinking selector",
    "  Ctrl+L     Open model selector",
    "  Ctrl+G     Open external editor ($VISUAL or $EDITOR)",
    "  Ctrl+O     Toggle tool output collapsed/expanded",
    "Input prefixes:",
    "  /          Slash command autocomplete",
    "  /thinking  Cycle or list/set thinking level",
    "  @          File path autocomplete",
    "  ! cmd      Run local shell command without sending to the model",
    "  !!         Repeat previous local shell command",
  ];
}
