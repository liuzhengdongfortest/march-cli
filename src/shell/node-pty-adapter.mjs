import pty from "node-pty";

export function createNodePtyAdapterFactory({
  ptyModule = pty,
  defaultCwd = process.cwd(),
  defaultEnv = process.env,
  platform = process.platform,
} = {}) {
  return function createNodePtyAdapter({
    command,
    args = [],
    cwd = defaultCwd,
    env = defaultEnv,
    onData,
    onExit,
    onError,
  }) {
    const resolved = resolveShellCommand({ command, args, platform });
    let term;
    try {
      term = ptyModule.spawn(resolved.command, resolved.args, {
        name: "xterm-color",
        cols: 80,
        rows: 24,
        cwd,
        env,
      });
    } catch (error) {
      onError?.(error);
      throw error;
    }

    term.onData?.((chunk) => onData?.(chunk));
    term.onExit?.((event) => onExit?.(event));

    return {
      write: (text) => term.write(String(text ?? "")),
      kill: () => term.kill(),
    };
  };
}

export function resolveShellCommand({ command, args = [], platform = process.platform }) {
  if (command) return { command, args: [...args] };
  if (platform === "win32") {
    return { command: "powershell.exe", args: ["-NoLogo", "-NoProfile"] };
  }
  return { command: process.env.SHELL || "sh", args: [] };
}
