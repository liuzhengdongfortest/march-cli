import { randomUUID } from "node:crypto";
import { createTerminalScreenBuffer } from "./screen-buffer.mjs";
import {
  appendOutput,
  closeShellForReplacement,
  findShellIdByName,
  isPromptNoise,
  markExited,
  markFailed,
  normalizeSize,
  publicShell,
  requireShell,
  stripAnsi,
  touch,
  uniqueName,
} from "./runtime-state.mjs";

export { stripAnsi } from "./runtime-state.mjs";

export function createShellRuntime({
  createPty,
  now = () => new Date(),
  maxScrollbackLines = 200,
  idFactory = () => randomUUID().slice(0, 8),
  defaultCommand = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "sh",
  defaultArgs = process.platform === "win32" ? ["-NoLogo", "-NoProfile"] : [],
  defaultCols = 120,
  defaultRows = 24,
  createScreenBuffer = createTerminalScreenBuffer,
} = {}) {
  if (typeof createPty !== "function") {
    throw new Error("createPty is required");
  }

  const shells = new Map();

  function spawnShell({
    name,
    command,
    args = [],
    cwd = process.cwd(),
    env = process.env,
    cols = defaultCols,
    rows = defaultRows,
    nameConflict = "suffix",
  } = {}) {
    const resolvedCommand = command || defaultCommand;
    const resolvedArgs = command ? args : (args.length ? args : defaultArgs);
    const baseName = String(name || resolvedCommand || "shell").trim() || "shell";
    const existing = shells.get(findShellIdByName(shells, baseName));
    if (existing && nameConflict === "reuse") {
      return publicShell(existing);
    }
    if (existing && nameConflict === "replace") {
      closeShellForReplacement(shells, existing);
    }
    const size = normalizeSize({ cols, rows, fallbackCols: defaultCols, fallbackRows: defaultRows });
    const id = idFactory();
    const shell = {
      id,
      name: uniqueName(baseName, shells),
      command: resolvedCommand,
      args: [...resolvedArgs],
      cwd,
      status: "starting",
      exitCode: null,
      signal: null,
      error: null,
      cols: size.cols,
      rows: size.rows,
      createdAt: now().toISOString(),
      updatedAt: now().toISOString(),
      rawChunks: [],
      plainLines: [],
      screen: createScreenBuffer({ cols: size.cols, rows: size.rows }),
      pty: null,
    };
    shells.set(id, shell);

    try {
      shell.pty = createPty({
        command: resolvedCommand,
        args: shell.args,
        cwd,
        env,
        cols: shell.cols,
        rows: shell.rows,
        onData: (chunk) => appendOutput(shell, chunk, maxScrollbackLines),
        onExit: (event = {}) => markExited(shell, event),
        onError: (error) => markFailed(shell, error),
      });
      shell.status = "running";
      touch(shell, now);
    } catch (error) {
      markFailed(shell, error);
    }

    return publicShell(shell);
  }

  function sendShell(id, text) {
    const shell = requireShell(shells, id);
    if (shell.status !== "running") {
      return { ok: false, error: `shell ${id} is ${shell.status}`, shell: publicShell(shell) };
    }
    shell.pty.write(String(text ?? ""));
    touch(shell, now);
    return { ok: true, shell: publicShell(shell) };
  }

  function resizeShell(id, { cols, rows } = {}) {
    const shell = requireShell(shells, id);
    const size = normalizeSize({ cols, rows, fallbackCols: shell.cols, fallbackRows: shell.rows });
    if (shell.cols === size.cols && shell.rows === size.rows) {
      return { ok: true, changed: false, shell: publicShell(shell) };
    }
    if (shell.status !== "running" && shell.status !== "starting") {
      return { ok: false, changed: false, error: `shell ${id} is ${shell.status}`, shell: publicShell(shell) };
    }
    if (typeof shell.pty?.resize !== "function") {
      return { ok: false, changed: false, error: `shell ${id} does not support resize`, shell: publicShell(shell) };
    }
    try {
      shell.pty.resize(size.cols, size.rows);
    } catch (error) {
      shell.status = "failed";
      shell.error = `resize failed: ${error?.message ?? String(error)}`;
      touch(shell, now);
      return { ok: false, changed: true, error: shell.error, shell: publicShell(shell) };
    }
    shell.cols = size.cols;
    shell.rows = size.rows;
    shell.screen?.resize?.(shell.cols, shell.rows);
    touch(shell, now);
    return { ok: true, changed: true, shell: publicShell(shell) };
  }

  function killShell(id) {
    const shell = requireShell(shells, id);
    if (shell.status !== "running" && shell.status !== "starting") {
      return { ok: false, error: `shell ${id} is ${shell.status}`, shell: publicShell(shell) };
    }
    shell.status = "killed";
    touch(shell, now);
    try {
      shell.pty?.kill?.();
    } catch (error) {
      shell.status = "failed";
      shell.error = `kill failed: ${error?.message ?? String(error)}`;
      touch(shell, now);
      return { ok: false, error: shell.error, shell: publicShell(shell) };
    }
    return { ok: true, shell: publicShell(shell) };
  }

  function listShells() {
    return [...shells.values()].map(publicShell);
  }

  function getShell(id) {
    const shell = shells.get(id);
    return shell ? publicShell(shell) : null;
  }

  function searchShell(id, pattern, { source = "auto", includePrompts = false } = {}) {
    const shell = requireShell(shells, id);
    const needle = String(pattern ?? "");
    const screenLines = shell.screen?.snapshot?.().plain?.split("\n") ?? [];
    const scrollbackLines = shell.plainLines;
    const lines = source === "screen" ? screenLines : source === "scrollback" ? scrollbackLines : screenLines;
    let matches = findLineMatches(lines, needle, shell, includePrompts);
    let resolvedSource = source === "auto" ? "screen" : source;
    if (source === "auto" && matches.length === 0) {
      matches = findLineMatches(scrollbackLines, needle, shell, includePrompts);
      resolvedSource = "scrollback";
    }
    return { shell: publicShell(shell), matches, source: resolvedSource };
  }

  function findLineMatches(lines, needle, shell, includePrompts) {
    return lines
      .map((line, index) => ({ index, line }))
      .filter(({ line }) => includePrompts || !isPromptNoise(line, shell))
      .filter(({ line }) => line.includes(needle));
  }

  function snapshotShell(id) {
    const shell = requireShell(shells, id);
    return {
      shell: publicShell(shell),
      ansi: shell.rawChunks.join(""),
      plain: shell.plainLines.join("\n"),
      screen: shell.screen?.snapshot?.() ?? null,
    };
  }

  function clearShell(id) {
    const shell = requireShell(shells, id);
    shell.rawChunks = [];
    shell.plainLines = [];
    shell.screen?.dispose?.();
    shell.screen = createScreenBuffer({ cols: shell.cols, rows: shell.rows });
    touch(shell, now);
    return { ok: true, shell: publicShell(shell) };
  }

  function killAll() {
    const results = [];
    for (const shell of shells.values()) {
      if (shell.status === "running" || shell.status === "starting") {
        results.push(killShell(shell.id));
      }
    }
    return results;
  }

  function dispose() {
    const results = killAll();
    for (const shell of shells.values()) {
      try {
        shell.pty?.dispose?.();
        shell.screen?.dispose?.();
      } catch (error) {
        shell.error = `dispose failed: ${error?.message ?? String(error)}`;
        touch(shell, now);
      }
    }
    return results;
  }

  return {
    spawnShell,
    sendShell,
    resizeShell,
    killShell,
    killAll,
    listShells,
    getShell,
    searchShell,
    snapshotShell,
    clearShell,
    dispose,
  };
}
