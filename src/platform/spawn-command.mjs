import { spawn } from "node:child_process";

export function spawnCommand(command, args = [], options = {}) {
  const resolved = resolveSpawnCommand(command, args);
  return spawn(resolved.command, resolved.args, { ...options, ...resolved.options });
}

export function resolveSpawnCommand(command, args = []) {
  if (process.platform !== "win32" || !isWindowsScriptCommand(command)) {
    return { command, args };
  }
  // Node can fail to spawn .cmd/.bat directly on Windows; cmd.exe runs them reliably.
  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", `"${[quoteCmdArg(command), ...args.map(quoteCmdArg)].join(" ")}"`],
    options: { windowsVerbatimArguments: true },
  };
}

function isWindowsScriptCommand(command) {
  const lower = command.toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
}

function quoteCmdArg(value) {
  return /[\s&()^|<>"%]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
