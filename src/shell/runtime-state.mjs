const OSC_RE = /\x1b\][^\x07]*(?:\x07|\x1b\\)/g;
const ANSI_RE = /\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function findShellIdByName(shells, name) {
  for (const shell of shells.values()) {
    if (shell.name === name) return shell.id;
  }
  return null;
}

export function closeShellForReplacement(shells, shell) {
  try {
    shell.pty?.kill?.();
    shell.screen?.dispose?.();
  } finally {
    shells.delete(shell.id);
  }
}

export function stripAnsi(text) {
  return String(text ?? "").replace(ANSI_RE, "");
}

export function appendOutput(shell, chunk, maxScrollbackLines) {
  const raw = stripControlPayloads(String(chunk ?? ""));
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

export function isPromptNoise(line, shell) {
  const text = String(line ?? "").trim();
  if (!text) return false;
  if (process.platform === "win32" || /powershell|pwsh|cmd/i.test(shell.command)) {
    if (/^(PS [A-Za-z]:\\.*>|[A-Za-z]:\\.*>)\s*$/.test(text)) return true;
    if (/^(PS [A-Za-z]:\\.*>|[A-Za-z]:\\.*>)\s+/.test(text)) return true;
  }
  return /^[^#$>\n]{0,80}[$#>]\s*$/.test(text);
}

export function markExited(shell, event) {
  if (shell.status === "killed") return;
  shell.status = "exited";
  shell.exitCode = event.exitCode ?? null;
  shell.signal = event.signal ?? null;
  shell.updatedAt = new Date().toISOString();
}

export function markFailed(shell, error) {
  shell.status = "failed";
  shell.error = error?.message ?? String(error);
  shell.updatedAt = new Date().toISOString();
}

export function touch(shell, now) {
  shell.updatedAt = now().toISOString();
}

export function requireShell(shells, id) {
  const shell = shells.get(id);
  if (!shell) throw new Error(`shell not found: ${id}`);
  return shell;
}

export function publicShell(shell) {
  const screenSnapshot = shell.screen?.snapshot?.() ?? null;
  const visibleLineCount = screenSnapshot?.plain
    ? screenSnapshot.plain.split("\n").filter((line) => line.length > 0).length
    : 0;
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
    scrollbackLineCount: shell.plainLines.length,
    visibleLineCount,
  };
}

export function normalizeSize({ cols, rows, fallbackCols, fallbackRows }) {
  return {
    cols: normalizePositiveInt(cols, fallbackCols),
    rows: normalizePositiveInt(rows, fallbackRows),
  };
}

export function uniqueName(baseName, shells) {
  const normalized = String(baseName || "shell").trim() || "shell";
  const names = new Set([...shells.values()].map((shell) => shell.name));
  if (!names.has(normalized)) return normalized;
  for (let index = 2; ; index++) {
    const candidate = `${normalized}-${index}`;
    if (!names.has(candidate)) return candidate;
  }
}

function stripControlPayloads(text) {
  return String(text ?? "").replace(OSC_RE, "");
}

function normalizePositiveInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return Math.max(1, Math.trunc(Number(fallback) || 1));
  return Math.max(1, Math.trunc(number));
}
