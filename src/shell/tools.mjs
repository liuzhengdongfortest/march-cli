import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export function createShellTools(shellRuntime = null) {
  if (!shellRuntime) return [];

  const shellSpawn = defineTool({
    name: "shell_spawn",
    label: "Shell Spawn",
    description: "Start a named interactive shell process. Omit command to start the platform default shell. Use this for long-running or prompt-based commands, not one-shot shell commands.",
    parameters: Type.Object({
      name: Type.Optional(Type.String({ description: "Optional user-facing shell name" })),
      command: Type.Optional(Type.String({ description: "Command to launch; omitted means platform default shell" })),
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

  const shellSend = defineTool({
    name: "shell_send",
    label: "Shell Send",
    description: "Send text or control sequences to a running interactive shell. To execute a command, end the text with \\r or \\n; line feeds are normalized to terminal Enter.",
    parameters: Type.Object({
      shell_id: Type.String({ description: "Shell id returned by shell_spawn or shell_list" }),
      text: Type.Optional(Type.String({ description: "Text to send to the shell. Use \\r or \\n for Enter." })),
      key: Type.Optional(Type.String({ description: "Named control key to send: enter, ctrl_c, ctrl_d, ctrl_z, tab, escape, backspace" })),
    }),
    execute: async (_toolCallId, params) => {
      const text = normalizeShellToolInput(params.text, params.key);
      const result = shellRuntime.sendShell(params.shell_id, text);
      if (!result.ok) return toolText(`Error: ${result.error}`, { error: true, shell: result.shell });
      return toolText(`Sent ${text.length} chars to ${result.shell.name} (${result.shell.id}).`, { shell: result.shell });
    },
  });

  const shellExec = defineTool({
    name: "shell_exec",
    label: "Shell Exec",
    description: "Execute one command in an interactive shell and wait until output becomes idle. If shell_id is omitted, starts the default shell first.",
    parameters: Type.Object({
      shell_id: Type.Optional(Type.String({ description: "Existing shell id; omitted starts the default shell" })),
      command: Type.String({ description: "Command to execute" }),
      name: Type.Optional(Type.String({ description: "Name for a newly spawned shell when shell_id is omitted" })),
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

  const shellList = defineTool({
    name: "shell_list",
    label: "Shell List",
    description: "List active and recently exited interactive shells.",
    parameters: Type.Object({}),
    execute: async () => {
      const shells = shellRuntime.listShells();
      if (!shells.length) return toolText("No shells.", { shells });
      return toolText(shells.map(formatShell).join("\n"), { shells });
    },
  });

  const shellKill = defineTool({
    name: "shell_kill",
    label: "Shell Kill",
    description: "Terminate a running interactive shell.",
    parameters: Type.Object({
      shell_id: Type.String({ description: "Shell id returned by shell_spawn or shell_list" }),
    }),
    execute: async (_toolCallId, params) => {
      const result = shellRuntime.killShell(params.shell_id);
      if (!result.ok) return toolText(`Error: ${result.error}`, { error: true, shell: result.shell });
      return toolText(`Killed ${result.shell.name} (${result.shell.id}).`, { shell: result.shell });
    },
  });

  const shellResize = defineTool({
    name: "shell_resize",
    label: "Shell Resize",
    description: "Resize an interactive shell PTY.",
    parameters: Type.Object({
      shell_id: Type.String({ description: "Shell id returned by shell_spawn or shell_list" }),
      cols: Type.Number({ description: "Columns" }),
      rows: Type.Number({ description: "Rows" }),
    }),
    execute: async (_toolCallId, params) => {
      const result = shellRuntime.resizeShell(params.shell_id, { cols: params.cols, rows: params.rows });
      if (!result.ok) return toolText(`Error: ${result.error}`, { error: true, shell: result.shell });
      return toolText(`Resized ${result.shell.name} (${result.shell.id}) to ${result.shell.cols}x${result.shell.rows}.`, result);
    },
  });

  const shellClear = defineTool({
    name: "shell_clear",
    label: "Shell Clear",
    description: "Clear March's captured scrollback and screen snapshot for a shell without terminating the process.",
    parameters: Type.Object({
      shell_id: Type.String({ description: "Shell id returned by shell_spawn or shell_list" }),
    }),
    execute: async (_toolCallId, params) => {
      const result = shellRuntime.clearShell(params.shell_id);
      return toolText(`Cleared ${result.shell.name} (${result.shell.id}).`, result);
    },
  });

  const shellSearch = defineTool({
    name: "shell_search",
    label: "Shell Search",
    description: "Search a shell's plain-text output. Defaults to visible screen first, then captured scrollback, while filtering prompt-only noise.",
    parameters: Type.Object({
      shell_id: Type.String({ description: "Shell id returned by shell_spawn or shell_list" }),
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

  const shellSnapshot = defineTool({
    name: "shell_snapshot",
    label: "Shell Snapshot",
    description: "Return the current shell screen and scrollback as plain text and ANSI text for visual debugging.",
    parameters: Type.Object({
      shell_id: Type.String({ description: "Shell id returned by shell_spawn or shell_list" }),
    }),
    execute: async (_toolCallId, params) => {
      const snapshot = shellRuntime.snapshotShell(params.shell_id);
      const text = snapshot.screen?.plain || snapshot.plain || "(empty shell output)";
      return toolText(text, snapshot);
    },
  });

  return [shellSpawn, shellSend, shellExec, shellList, shellKill, shellResize, shellClear, shellSearch, shellSnapshot];
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
