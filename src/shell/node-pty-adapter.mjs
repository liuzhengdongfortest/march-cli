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
    cols = 80,
    rows = 24,
    onData,
    onExit,
    onError,
  }) {
    const resolved = resolveShellCommand({ command, args, platform });
    let term;
    try {
      term = ptyModule.spawn(resolved.command, resolved.args, {
        name: "xterm-color",
        cols,
        rows,
        cwd,
        env,
      });
    } catch (error) {
      onError?.(error);
      throw error;
    }

    let disposed = false;
    const disposeTerminal = () => {
      if (disposed) return;
      disposed = true;
      // node-pty's Windows kill path can emit noisy AttachConsole failures after
      // a natural exit. Closing the backing socket releases Node handles without
      // forcing the PTY helper down the kill path.
      if (typeof term._socket?.destroy === "function") {
        term._socket.destroy();
      } else if (typeof term.destroy === "function") {
        term.destroy();
      } else if (typeof term.kill === "function") {
        term.kill();
      }
    };

    term.onData?.((chunk) => onData?.(chunk));
    term.onExit?.((event) => {
      onExit?.(event);
      disposeTerminal();
    });

    return {
      write: (text) => term.write(String(text ?? "")),
      resize: (nextCols, nextRows) => term.resize?.(nextCols, nextRows),
      kill: () => disposeTerminal(),
      dispose: () => disposeTerminal(),
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
