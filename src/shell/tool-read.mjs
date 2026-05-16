import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../agent/tool-result.mjs";

export function createTerminalReadTool(shellRuntime) {
  return defineTool({
    name: "terminal_read",
    label: "Terminal Read",
    description: "Read plain-text output from a running interactive terminal. Use this for normal shell inspection after shell hints, terminal_list, or terminal_send.",
    parameters: Type.Object({
      shell_id: Type.String({ description: "Shell id or name returned by terminal_spawn, terminal_list, or shell_hints" }),
      source: Type.Optional(Type.String({ description: "screen (default), scrollback, or both" })),
      lines: Type.Optional(Type.Number({ description: "Number of trailing lines to return. Default 80, max 300" })),
    }),
    execute: async (_toolCallId, params) => {
      const resolved = resolveShellId(shellRuntime, params.shell_id);
      if (!resolved.ok) return toolText(`Error: ${resolved.error}`, { error: true });
      const snapshot = shellRuntime.snapshotShell(resolved.id);
      const source = normalizeReadSource(params.source);
      const lineLimit = normalizeLineLimit(params.lines);
      const text = formatTerminalRead(snapshot, { source, lines: lineLimit });
      return toolText(text, { shell: snapshot.shell, source, lines: lineLimit, snapshot });
    },
  });
}

function resolveShellId(shellRuntime, ref) {
  const value = String(ref ?? "").trim();
  const shells = shellRuntime.listShells();
  const shell = shells.find((shell) => shell.id === value || shell.name === value);
  if (shell) return { ok: true, id: shell.id, shell };
  const available = shells.length
    ? ` Active shells: ${shells.map((shell) => `${shell.id} (${shell.name})`).join(", ")}.`
    : " No active shells.";
  return { ok: false, error: `shell not found: ${value}.${available}` };
}

function normalizeReadSource(value) {
  const normalized = String(value ?? "screen").trim().toLowerCase();
  if (normalized === "scrollback") return "scrollback";
  if (normalized === "both") return "both";
  return "screen";
}

function normalizeLineLimit(value) {
  const number = Math.trunc(Number(value) || 80);
  return Math.min(300, Math.max(1, number));
}

function formatTerminalRead(snapshot, { source, lines }) {
  const shell = snapshot.shell;
  const header = [
    `## ${shell.name} (${shell.id})`,
    `status: ${shell.status}`,
    `command: ${shell.command}${shell.args?.length ? ` ${shell.args.join(" ")}` : ""}`,
    `cwd: ${shell.cwd}`,
    `source: ${source}`,
    `lines: ${lines}`,
    "",
  ].join("\n");
  if (source === "both") {
    return `${header}${formatReadSection("screen", snapshot.screen?.plain, lines)}\n\n${formatReadSection("scrollback", snapshot.plain, lines)}`;
  }
  const content = source === "scrollback" ? snapshot.plain : snapshot.screen?.plain;
  return `${header}${lastLines(content, lines) || "(empty shell output)"}`;
}

function formatReadSection(label, text, lines) {
  return `-- ${label} --\n${lastLines(text, lines) || "(empty shell output)"}`;
}

function lastLines(text, lines) {
  return String(text ?? "").split(/\r?\n/).slice(-lines).join("\n").trimEnd();
}
