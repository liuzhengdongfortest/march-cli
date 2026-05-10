import { randomUUID } from "node:crypto";
import { createTerminalScreenBuffer } from "./screen-buffer.mjs";

const ANSI_RE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function createShellRuntime({
  createPty,
  now = () => new Date(),
  maxScrollbackLines = 200,
  idFactory = () => randomUUID().slice(0, 8),
  defaultCommand = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "sh",
  defaultArgs = process.platform === "win32" ? ["-NoLogo", "-NoProfile"] : [],
  defaultCols = 80,
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
  } = {}) {
    const resolvedCommand = command || defaultCommand;
    const resolvedArgs = command ? args : (args.length ? args : defaultArgs);
    const size = normalizeSize({ cols, rows, fallbackCols: defaultCols, fallbackRows: defaultRows });
    const id = idFactory();
    const shell = {
      id,
      name: uniqueName(name || resolvedCommand, shells),
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

  function searchShell(id, pattern) {
    const shell = requireShell(shells, id);
    const needle = String(pattern ?? "");
    const matches = shell.plainLines
      .map((line, index) => ({ index, line }))
      .filter(({ line }) => line.includes(needle));
    return { shell: publicShell(shell), matches };
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
    dispose,
  };
}

export function stripAnsi(text) {
  return String(text ?? "").replace(ANSI_RE, "");
}

function appendOutput(shell, chunk, maxScrollbackLines) {
  const raw = String(chunk ?? "");
  shell.screen?.write?.(raw);
  shell.rawChunks.push(raw);
  if (shell.rawChunks.length > maxScrollbackLines * 4) {
    shell.rawChunks = shell.rawChunks.slice(-(maxScrollbackLines * 4));
  }

  const plain = stripAnsi(raw).replace(/\r/g, "");
  for (const line of plain.split("\n")) {
    if (line === "") continue;
    shell.plainLines.push(line);
  }
  if (shell.plainLines.length > maxScrollbackLines) {
    shell.plainLines = shell.plainLines.slice(-maxScrollbackLines);
  }
}

function markExited(shell, event) {
  if (shell.status === "killed") return;
  shell.status = "exited";
  shell.exitCode = event.exitCode ?? null;
  shell.signal = event.signal ?? null;
  shell.updatedAt = new Date().toISOString();
}

function markFailed(shell, error) {
  shell.status = "failed";
  shell.error = error?.message ?? String(error);
  shell.updatedAt = new Date().toISOString();
}

function touch(shell, now) {
  shell.updatedAt = now().toISOString();
}

function requireShell(shells, id) {
  const shell = shells.get(id);
  if (!shell) throw new Error(`shell not found: ${id}`);
  return shell;
}

function publicShell(shell) {
  return {
    id: shell.id,
    name: shell.name,
    command: shell.command,
    args: [...shell.args],
    cwd: shell.cwd,
    status: shell.status,
    exitCode: shell.exitCode,
    signal: shell.signal,
    error: shell.error,
    cols: shell.cols,
    rows: shell.rows,
    createdAt: shell.createdAt,
    updatedAt: shell.updatedAt,
    lineCount: shell.plainLines.length,
  };
}

function normalizeSize({ cols, rows, fallbackCols, fallbackRows }) {
  return {
    cols: normalizePositiveInt(cols, fallbackCols),
    rows: normalizePositiveInt(rows, fallbackRows),
  };
}

function normalizePositiveInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return Math.max(1, Math.trunc(Number(fallback) || 1));
  return Math.max(1, Math.trunc(number));
}

function uniqueName(baseName, shells) {
  const normalized = String(baseName || "shell").trim() || "shell";
  const names = new Set([...shells.values()].map((shell) => shell.name));
  if (!names.has(normalized)) return normalized;
  for (let index = 2; ; index++) {
    const candidate = `${normalized}-${index}`;
    if (!names.has(candidate)) return candidate;
  }
}
