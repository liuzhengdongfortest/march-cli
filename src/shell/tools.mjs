import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export function createShellTools(shellRuntime = null) {
  if (!shellRuntime) return [];

  const shellSpawn = defineTool({
    name: "shell_spawn",
    label: "Shell Spawn",
    description: "Start a named interactive shell process. Use this for long-running or prompt-based commands, not one-shot shell commands.",
    parameters: Type.Object({
      name: Type.Optional(Type.String({ description: "Optional user-facing shell name" })),
      command: Type.String({ description: "Command to launch" }),
      args: Type.Optional(Type.Array(Type.String(), { description: "Command arguments" })),
      cwd: Type.Optional(Type.String({ description: "Working directory" })),
    }),
    execute: async (_toolCallId, params) => {
      const shell = shellRuntime.spawnShell({
        name: params.name,
        command: params.command,
        args: params.args ?? [],
        cwd: params.cwd,
      });
      return toolText(formatShell(shell), { shell });
    },
  });

  const shellSend = defineTool({
    name: "shell_send",
    label: "Shell Send",
    description: "Send text or control sequences to a running interactive shell.",
    parameters: Type.Object({
      shell_id: Type.String({ description: "Shell id returned by shell_spawn or shell_list" }),
      text: Type.String({ description: "Text to send to the shell" }),
    }),
    execute: async (_toolCallId, params) => {
      const result = shellRuntime.sendShell(params.shell_id, params.text);
      if (!result.ok) return toolText(`Error: ${result.error}`, { error: true, shell: result.shell });
      return toolText(`Sent ${params.text.length} chars to ${result.shell.name} (${result.shell.id}).`, { shell: result.shell });
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

  return [shellSpawn, shellSend, shellList, shellKill];
}

function formatShell(shell) {
  const args = shell.args?.length ? ` ${shell.args.join(" ")}` : "";
  const lines = `${shell.lineCount ?? 0} lines`;
  return `${shell.id}  ${shell.name}  ${shell.status}  ${shell.command}${args}  ${lines}`;
}

function toolText(text, details = {}) {
  return { content: [{ type: "text", text }], details };
}
