import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "./tool-result.mjs";
import { stripAnsi } from "../text/ansi.mjs";

const OUTPUT_LIMIT = 64 * 1024;
const DEFAULT_COMMAND_TIMEOUT_SECONDS = 60;
const COMMAND_KILL_GRACE_MS = 1000;

export function createCommandExecTool({ cwd }) {
  return defineTool({
    name: "command_exec",
    label: "Command Exec",
    description: "Run a one-shot command in the project directory. Use terminal_* for interactive or long-running processes.",
    parameters: Type.Object({
      command: Type.String({ description: "Command to execute" }),
      shell: Type.Optional(Type.String({ description: "auto (default), bash, or powershell" })),
      timeout: Type.Optional(Type.Number({ description: "Timeout in seconds; default 60", default: DEFAULT_COMMAND_TIMEOUT_SECONDS })),
    }),
    execute: async (_toolCallId, params, signal) => executeCommand({ cwd, signal, ...params }),
  });
}

export async function executeCommand({ cwd, command, shell = "auto", timeout = DEFAULT_COMMAND_TIMEOUT_SECONDS, signal, spawnImpl = spawn, killProcessTreeImpl = killProcessTree, forceSettleMs = COMMAND_KILL_GRACE_MS }) {
  let resolved;
  try {
    resolved = resolveCommandShell(shell);
  } catch (err) {
    return toolText(`Error: ${err.message}`, { error: true });
  }

  const timeoutSeconds = Math.max(0.001, Number(timeout) || DEFAULT_COMMAND_TIMEOUT_SECONDS);
  const timeoutMs = timeoutSeconds * 1000;
  const result = await spawnCommand(spawnImpl, resolved.bin, [...resolved.args, String(command ?? "")], {
    cwd,
    timeoutMs,
    signal,
    windowsHide: true,
    killProcessTreeImpl,
    forceSettleMs,
  });
  if (result.error) {
    const detail = result.timedOut ? ` (timed out after ${timeoutSeconds}s)` : "";
    return toolText(`Error: ${result.error.message}${detail}`, { error: true });
  }
  const stdout = stripAnsi(result.stdout ?? "");
  const stderr = stripAnsi(result.stderr ?? "");
  const output = formatCommandOutput({ stdout, stderr, status: result.status });
  return toolText(output, {
    status: result.status,
    stdout,
    stderr,
    shell: resolved.name,
    error: result.status !== 0,
  });
}

function spawnCommand(spawnImpl, bin, args, options) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let forceTimer = null;
    const child = spawnImpl(bin, args, {
      cwd: options.cwd,
      windowsHide: options.windowsHide,
      detached: process.platform !== "win32",
    });
    const timer = setTimeout(() => {
      timedOut = true;
      terminateChild(new Error("Command timed out"));
    }, options.timeoutMs);
    const onAbort = () => {
      aborted = true;
      terminateChild(new Error("Command aborted"));
    };
    if (options.signal?.aborted) queueMicrotask(onAbort);
    else options.signal?.addEventListener?.("abort", onAbort, { once: true });

    child.stdout?.setEncoding?.("utf8");
    child.stderr?.setEncoding?.("utf8");
    child.stdout?.on?.("data", (chunk) => { stdout = appendLimited(stdout, chunk); });
    child.stderr?.on?.("data", (chunk) => { stderr = appendLimited(stderr, chunk); });
    child.once?.("error", (error) => finish({ error }));
    child.once?.("close", (status, signal) => finish({ status, signal }));

    function terminateChild(error) {
      if (settled) return;
      options.killProcessTreeImpl?.(child);
      forceTimer ??= setTimeout(() => finish({ error }), options.forceSettleMs);
    }

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceTimer);
      options.signal?.removeEventListener?.("abort", onAbort);
      const error = result.error ?? (timedOut ? Object.assign(new Error("Command timed out"), { code: "ETIMEDOUT" }) : null) ?? (aborted ? Object.assign(new Error("Command aborted"), { code: "ABORT_ERR" }) : null);
      resolve({ ...result, error, stdout, stderr, timedOut, aborted });
    }
  });
}

function killProcessTree(child, platform = process.platform) {
  if (!child?.pid) {
    child?.kill?.("SIGTERM");
    return;
  }
  if (platform === "win32") {
    try {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 5000 });
      return;
    } catch {}
  }
  try {
    process.kill(-child.pid, "SIGTERM");
    return;
  } catch {}
  child.kill?.("SIGTERM");
}

function appendLimited(current, chunk) {
  const next = current + String(chunk ?? "");
  return next.length <= OUTPUT_LIMIT ? next : next.slice(-OUTPUT_LIMIT);
}

export function resolveCommandShell(shell = "auto", platform = process.platform) {
  const normalized = String(shell ?? "auto").trim().toLowerCase();
  if (normalized === "powershell" || (normalized === "auto" && platform === "win32")) {
    return { name: "powershell", bin: findPowerShell() ?? "powershell.exe", args: ["-NoProfile", "-Command"] };
  }
  if (normalized === "bash" || normalized === "auto") {
    return { name: "bash", bin: "bash", args: ["-lc"] };
  }
  throw new Error(`unsupported shell: ${shell}`);
}

function findPowerShell() {
  for (const name of ["pwsh.exe", "powershell.exe"]) {
    try {
      const result = spawnSync("where", [name], { encoding: "utf-8", timeout: 5000, windowsHide: true });
      if (result.status === 0 && result.stdout) {
        const first = result.stdout.trim().split(/\r?\n/)[0];
        if (first && existsSync(first)) return first;
      }
    } catch {}
  }
  return null;
}

function formatCommandOutput({ stdout, stderr, status }) {
  const parts = [];
  if (stdout) parts.push(stdout.trimEnd());
  if (stderr) parts.push(stderr.trimEnd());
  if (status && status !== 0) parts.push(`exit ${status}`);
  const output = parts.filter(Boolean).join("\n");
  return output ? truncateOutput(output) : "(no output)";
}

function truncateOutput(text) {
  if (text.length <= OUTPUT_LIMIT) return text;
  return `${text.slice(-OUTPUT_LIMIT)}\n... (truncated to last ${OUTPUT_LIMIT} chars)`;
}
