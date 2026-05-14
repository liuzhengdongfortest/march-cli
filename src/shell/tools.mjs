import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export function createShellTools(shellRuntime = null) {
  if (!shellRuntime) return [];

  const terminalSpawn = defineTool({
    name: "terminal_spawn",
    label: "Terminal Spawn",
    description: "Start a named interactive terminal process. Omit command to start the platform default terminal. Use this for long-running or prompt-based commands, not one-shot commands.",
    parameters: Type.Object({
      name: Type.Optional(Type.String({ description: "Optional user-facing shell name" })),
      command: Type.Optional(Type.String({ description: "Command to launch; omitted means platform default terminal" })),
      args: Type.Optional(Type.Array(Type.String(), { description: "Command arguments" })),
      cwd: Type.Optional(Type.String({ description: "Working directory" })),
      cols: Type.Optional(Type.Number({ description: "Initial PTY columns" })),
      rows: Type.Optional(Type.Number({ description: "Initial PTY rows" })),
      if_exists: Type.Optional(Type.String({ description: "Name conflict behavior: reuse (default), replace, or new" })),
    }),
    execute: async (_toolCallId, params) => {
      const shell = shellRuntime.spawnShell({
        name: params.name,
        command: params.command,
        args: params.args ?? [],
        cwd: params.cwd,
        cols: params.cols,
        rows: params.rows,
        nameConflict: normalizeNameConflict(params.if_exists),
      });
      return toolText(formatShell(shell), { shell });
    },
  });

  const terminalSend = defineTool({
    name: "terminal_send",
    label: "Terminal Send",
    description: "Send text or control sequences to a running interactive terminal. To execute a command, end the text with \\r or \\n; line feeds are normalized to terminal Enter.",
    parameters: Type.Object({
      shell_id: Type.String({ description: "Shell id returned by terminal_spawn or terminal_list" }),
      text: Type.Optional(Type.String({ description: "Text to send to the terminal. Use \\r or \\n for Enter." })),
      key: Type.Optional(Type.String({ description: "Named control key to send: enter, ctrl_c, ctrl_d, ctrl_z, tab, escape, backspace" })),
    }),
    execute: async (_toolCallId, params) => {
      const text = normalizeShellToolInput(params.text, params.key);
      const result = shellRuntime.sendShell(params.shell_id, text);
      if (!result.ok) return toolText(`Error: ${result.error}`, { error: true, shell: result.shell });
      return toolText(`Sent ${text.length} chars to ${result.shell.name} (${result.shell.id}).`, { shell: result.shell });
    },
  });

  const terminalRun = defineTool({
    name: "terminal_run",
    label: "Terminal Run",
    description: "Run one command inside an interactive terminal and wait until output becomes idle. If shell_id is omitted, starts the default terminal first.",
    parameters: Type.Object({
      shell_id: Type.Optional(Type.String({ description: "Existing terminal id; omitted starts the default terminal" })),
      command: Type.String({ description: "Command to execute" }),
      name: Type.Optional(Type.String({ description: "Name for a newly spawned terminal when shell_id is omitted" })),
      timeout_ms: Type.Optional(Type.Number({ description: "Maximum wait time, default 10000" })),
      idle_ms: Type.Optional(Type.Number({ description: "Output idle time before returning, default 300" })),
    }),
    execute: async (_toolCallId, params) => {
      const shell = params.shell_id
        ? shellRuntime.getShell(params.shell_id)
        : shellRuntime.spawnShell({ name: params.name || "exec" });
      if (!shell) return toolText(`Error: shell not found: ${params.shell_id}`, { error: true });
      const before = shellRuntime.snapshotShell(shell.id).plain;
      const sent = shellRuntime.sendShell(shell.id, normalizeShellToolInput(`${params.command}\n`));
      if (!sent.ok) return toolText(`Error: ${sent.error}`, { error: true, shell: sent.shell });
      const result = await waitForShellIdle(shellRuntime, shell.id, before, {
        timeoutMs: params.timeout_ms,
        idleMs: params.idle_ms,
      });
      const text = result.delta || result.snapshot.plain || "(no output)";
      return toolText(text, {
        shell: result.shell,
        timedOut: result.timedOut,
        delta: result.delta,
        snapshot: result.snapshot,
      });
    },
  });

  const terminalList = defineTool({
    name: "terminal_list",
    label: "Terminal List",
    description: "List active and recently exited interactive terminals.",
    parameters: Type.Object({}),
    execute: async () => {
      const shells = shellRuntime.listShells();
      if (!shells.length) return toolText("No shells.", { shells });
      return toolText(shells.map(formatShell).join("\n"), { shells });
    },
  });

  const terminalKill = defineTool({
    name: "terminal_kill",
    label: "Terminal Kill",
    description: "Terminate a running interactive terminal.",
    parameters: Type.Object({
      shell_id: Type.String({ description: "Shell id returned by terminal_spawn or terminal_list" }),
    }),
    execute: async (_toolCallId, params) => {
      const result = shellRuntime.killShell(params.shell_id);
      if (!result.ok) return toolText(`Error: ${result.error}`, { error: true, shell: result.shell });
      return toolText(`Killed ${result.shell.name} (${result.shell.id}).`, { shell: result.shell });
    },
  });

  const terminalResize = defineTool({
    name: "terminal_resize",
    label: "Terminal Resize",
    description: "Resize an interactive terminal PTY.",
    parameters: Type.Object({
      shell_id: Type.String({ description: "Shell id returned by terminal_spawn or terminal_list" }),
      cols: Type.Number({ description: "Columns" }),
      rows: Type.Number({ description: "Rows" }),
    }),
    execute: async (_toolCallId, params) => {
      const result = shellRuntime.resizeShell(params.shell_id, { cols: params.cols, rows: params.rows });
      if (!result.ok) return toolText(`Error: ${result.error}`, { error: true, shell: result.shell });
      return toolText(`Resized ${result.shell.name} (${result.shell.id}) to ${result.shell.cols}x${result.shell.rows}.`, result);
    },
  });

  const terminalClear = defineTool({
    name: "terminal_clear",
    label: "Terminal Clear",
    description: "Clear March's captured scrollback and screen snapshot for a terminal without terminating the process.",
    parameters: Type.Object({
      shell_id: Type.String({ description: "Shell id returned by terminal_spawn or terminal_list" }),
    }),
    execute: async (_toolCallId, params) => {
      const result = shellRuntime.clearShell(params.shell_id);
      return toolText(`Cleared ${result.shell.name} (${result.shell.id}).`, result);
    },
  });

  const terminalSearch = defineTool({
    name: "terminal_search",
    label: "Terminal Search",
    description: "Search a terminal's plain-text output. Defaults to visible screen first, then captured scrollback, while filtering prompt-only noise.",
    parameters: Type.Object({
      shell_id: Type.String({ description: "Shell id returned by terminal_spawn or terminal_list" }),
      pattern: Type.String({ description: "Plain text to search for" }),
      source: Type.Optional(Type.String({ description: "auto (default), screen, or scrollback" })),
      include_prompts: Type.Optional(Type.Boolean({ description: "Include shell prompt/echo lines in results; default false" })),
    }),
    execute: async (_toolCallId, params) => {
      const result = shellRuntime.searchShell(params.shell_id, params.pattern, {
        source: params.source,
        includePrompts: params.include_prompts,
      });
      if (!result.matches.length) return toolText(`No matches in ${result.shell.name} (${result.shell.id}).`, result);
      const lines = result.matches.map((match) => `${match.index + 1}: ${match.line}`);
      return toolText(lines.join("\n"), result);
    },
  });

  const terminalSnapshot = defineTool({
    name: "terminal_snapshot",
    label: "Terminal Snapshot",
    description: "Return the current terminal screen and scrollback as plain text and ANSI text for visual debugging.",
    parameters: Type.Object({
      shell_id: Type.String({ description: "Shell id returned by terminal_spawn or terminal_list" }),
    }),
    execute: async (_toolCallId, params) => {
      const snapshot = shellRuntime.snapshotShell(params.shell_id);
      const text = snapshot.screen?.plain || snapshot.plain || "(empty shell output)";
      return toolText(text, snapshot);
    },
  });

  return [terminalSpawn, terminalSend, terminalRun, terminalList, terminalKill, terminalResize, terminalClear, terminalSearch, terminalSnapshot];
}

function formatShell(shell) {
  const args = shell.args?.length ? ` ${shell.args.join(" ")}` : "";
  const lines = `${shell.visibleLineCount ?? 0} visible, ${shell.scrollbackLineCount ?? shell.lineCount ?? 0} captured`;
  const error = shell.error ? `  error: ${shell.error}` : "";
  return `${shell.id}  ${shell.name}  ${shell.status}  ${shell.command}${args}  ${lines}${error}`;
}

function normalizeNameConflict(value) {
  const normalized = String(value ?? "reuse").trim().toLowerCase();
  if (normalized === "replace") return "replace";
  if (normalized === "new" || normalized === "suffix") return "suffix";
  return "reuse";
}

function normalizeShellToolInput(text, key) {
  if (key) return controlKeyToSequence(key);
  return String(text ?? "").replace(/\r\n/g, "\r").replace(/\n/g, "\r");
}

function controlKeyToSequence(key) {
  const normalized = String(key ?? "").trim().toLowerCase().replace(/[-+ ]/g, "_");
  const sequences = {
    enter: "\r",
    ctrl_c: "\x03",
    ctrl_d: "\x04",
    ctrl_z: "\x1a",
    tab: "\t",
    escape: "\x1b",
    esc: "\x1b",
    backspace: "\x7f",
  };
  if (!sequences[normalized]) throw new Error(`unsupported shell key: ${key}`);
  return sequences[normalized];
}

async function waitForShellIdle(shellRuntime, shellId, beforePlain, { timeoutMs = 10000, idleMs = 300 } = {}) {
  const timeout = Math.max(1, Number(timeoutMs) || 10000);
  const idle = Math.max(1, Number(idleMs) || 300);
  const started = Date.now();
  let lastPlain = beforePlain;
  let lastChanged = Date.now();
  let snapshot = shellRuntime.snapshotShell(shellId);

  for (;;) {
    await sleep(50);
    snapshot = shellRuntime.snapshotShell(shellId);
    const plain = snapshot.plain;
    if (plain !== lastPlain) {
      lastPlain = plain;
      lastChanged = Date.now();
    }
    const timedOut = Date.now() - started >= timeout;
    if (timedOut || (plain !== beforePlain && Date.now() - lastChanged >= idle)) {
      const delta = plain.startsWith(beforePlain) ? plain.slice(beforePlain.length).replace(/^\n/, "") : plain;
      return {
        shell: shellRuntime.getShell(shellId),
        snapshot,
        delta,
        timedOut,
      };
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toolText(text, details = {}) {
  return { content: [{ type: "text", text }], details };
}
