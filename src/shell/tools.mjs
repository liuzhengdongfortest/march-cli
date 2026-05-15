import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../agent/tool-result.mjs";

export function createShellTools(shellRuntime = null, { platform = process.platform } = {}) {
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
    description: "Send text and/or a control key to a running interactive terminal. If both text and key are provided, the key is appended after the text. Set wait_for_idle=true after sending Enter when you need output. Enter is converted for the current platform; Windows PTYs use CRLF.",
    parameters: Type.Object({
      shell_id: Type.String({ description: "Shell id returned by terminal_spawn or terminal_list" }),
      text: Type.Optional(Type.String({ description: "Text to type into the terminal. Include a newline (\\n/\\r) or combine with key:\"enter\" to execute a command. Newlines are converted to the platform Enter sequence; Windows PTYs use CRLF." })),
      key: Type.Optional(Type.String({ description: "Named control key to send after text when text is provided: enter, ctrl_c, ctrl_d, ctrl_z, tab, escape, backspace" })),
      wait_for_idle: Type.Optional(Type.Boolean({ description: "Wait until terminal output becomes idle and return the output delta; does not press Enter automatically; default false" })),
      timeout_ms: Type.Optional(Type.Number({ description: "Maximum wait time when wait_for_idle=true, default 10000" })),
      idle_ms: Type.Optional(Type.Number({ description: "Output idle time before returning when wait_for_idle=true, default 1000 after Enter, otherwise 300" })),
    }),
    execute: async (_toolCallId, params) => {
      const before = params.wait_for_idle ? shellRuntime.snapshotShell(params.shell_id) : null;
      const text = normalizeShellToolInput(params.text, params.key, { platform });
      const result = shellRuntime.sendShell(params.shell_id, text);
      if (!result.ok) return toolText(`Error: ${result.error}`, { error: true, shell: result.shell });
      if (params.wait_for_idle) {
        const submitted = text.includes("\r") || text.includes("\n");
        const idle = await waitForShellIdle(shellRuntime, params.shell_id, before, {
          timeoutMs: params.timeout_ms,
          idleMs: params.idle_ms ?? (submitted ? 1000 : 300),
          submittedText: submitted ? text : "",
        });
        const output = idle.delta || idle.screenDelta || idle.snapshot.screen?.plain || idle.snapshot.plain || "(no output)";
        return toolText(output, {
          shell: idle.shell,
          timedOut: idle.timedOut,
          delta: idle.delta,
          screenDelta: idle.screenDelta,
          snapshot: idle.snapshot,
        });
      }
      return toolText(`Sent ${text.length} chars to ${result.shell.name} (${result.shell.id}).`, { shell: result.shell });
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
      let result;
      try {
        result = shellRuntime.clearShell(params.shell_id);
      } catch (error) {
        return toolText(`Error: ${error?.message ?? String(error)}`, { error: true });
      }
      if (!result.ok) return toolText(`Error: ${result.error}`, { error: true, shell: result.shell });
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

  return [terminalSpawn, terminalSend, terminalList, terminalKill, terminalResize, terminalClear, terminalSearch, terminalSnapshot];
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

function normalizeShellToolInput(text, key, { platform = process.platform } = {}) {
  const enter = enterSequenceForPlatform(platform);
  const marker = "\0MARCH_ENTER\0";
  const normalizedText = String(text ?? "")
    .replace(/\\r\\n|\\n|\\r/g, marker)
    .replace(/\r\n|\n|\r/g, marker)
    .replaceAll(marker, enter);
  return normalizedText + (key ? controlKeyToSequence(key, { platform }) : "");
}

function controlKeyToSequence(key, { platform = process.platform } = {}) {
  const normalized = String(key ?? "").trim().toLowerCase().replace(/[-+ ]/g, "_");
  const sequences = {
    enter: enterSequenceForPlatform(platform),
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

async function waitForShellIdle(shellRuntime, shellId, beforeSnapshot, { timeoutMs = 10000, idleMs = 300, submittedText = "" } = {}) {
  const timeout = Math.max(1, Number(timeoutMs) || 10000);
  const idle = Math.max(1, Number(idleMs) || 300);
  const submitted = Boolean(submittedText);
  const echoOnlyGraceMs = Math.min(timeout, 2500);
  const screenOnlyGraceMs = Math.min(timeout, 2500);
  const beforePlain = beforeSnapshot?.plain ?? "";
  const beforeScreenPlain = beforeSnapshot?.screen?.plain ?? "";
  const started = Date.now();
  let lastPlain = beforePlain;
  let lastScreenPlain = beforeScreenPlain;
  let lastChanged = Date.now();
  let snapshot = shellRuntime.snapshotShell(shellId);

  for (;;) {
    await sleep(50);
    snapshot = shellRuntime.snapshotShell(shellId);
    const plain = snapshot.plain;
    const screenPlain = snapshot.screen?.plain ?? "";
    const hasPlainChange = plain !== beforePlain;
    const hasScreenChange = screenPlain !== beforeScreenPlain;
    const delta = plain.startsWith(beforePlain) ? plain.slice(beforePlain.length).replace(/^\n/, "") : plain;
    const screenDelta = screenPlain.startsWith(beforeScreenPlain) ? screenPlain.slice(beforeScreenPlain.length).replace(/^\n/, "") : screenPlain;
    if (plain !== lastPlain || screenPlain !== lastScreenPlain) {
      lastPlain = plain;
      lastScreenPlain = screenPlain;
      lastChanged = Date.now();
    }
    const elapsed = Date.now() - started;
    const timedOut = elapsed >= timeout;
    const echoOnly = submitted && hasPlainChange && isLikelyEchoOnlyDelta(delta, submittedText);
    const changedEnough = hasPlainChange || (!submitted && hasScreenChange) || (submitted && hasScreenChange && elapsed >= screenOnlyGraceMs);
    const echoOnlyAllowed = !echoOnly || elapsed >= echoOnlyGraceMs;
    if (timedOut || (changedEnough && echoOnlyAllowed && Date.now() - lastChanged >= idle)) {
      return {
        shell: shellRuntime.getShell(shellId),
        snapshot,
        delta,
        screenDelta,
        timedOut,
      };
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enterSequenceForPlatform(platform) {
  return platform === "win32" ? "\r\n" : "\r";
}

function isLikelyEchoOnlyDelta(delta, submittedText) {
  const submitted = String(submittedText ?? "").replace(/[\r\n]+$/g, "").trim();
  const lines = String(delta ?? "")
    .split("\n")
    .map((line) => line.replace(/\r/g, "").trim())
    .filter(Boolean);
  if (!submitted || lines.length !== 1) return false;
  return lines[0] === submitted || lines[0].endsWith(submitted);
}
