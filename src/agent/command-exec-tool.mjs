import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "./tool-result.mjs";
import { stripAnsi } from "../text/ansi.mjs";

const OUTPUT_LIMIT = 64 * 1024;

export function createCommandExecTool({ cwd }) {
  return defineTool({
    name: "command_exec",
    label: "Command Exec",
    description: "Run a one-shot command in the project directory. Use terminal_* for interactive or long-running processes.",
    parameters: Type.Object({
      command: Type.String({ description: "Command to execute" }),
      shell: Type.Optional(Type.String({ description: "auto (default), bash, or powershell" })),
      timeout: Type.Optional(Type.Number({ description: "Timeout in seconds; default 60" })),
    }),
    execute: async (_toolCallId, params) => executeCommand({ cwd, ...params }),
  });
}

export function executeCommand({ cwd, command, shell = "auto", timeout = 60, spawnSyncImpl = spawnSync }) {
  let resolved;
  try {
    resolved = resolveCommandShell(shell);
  } catch (err) {
    return toolText(`Error: ${err.message}`, { error: true });
  }
  const result = spawnSyncImpl(resolved.bin, [...resolved.args, String(command ?? "")], {
    cwd,
    encoding: "utf8",
    timeout: Math.max(1, Number(timeout) || 60) * 1000,
    windowsHide: true,
    maxBuffer: OUTPUT_LIMIT,
  });
  if (result.error) return toolText(`Error: ${result.error.message}`, { error: true });
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
