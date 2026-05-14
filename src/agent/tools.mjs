import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  createBashToolDefinition,
  defineTool,
} from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { createEditFileTool } from "./file-edit-tool.mjs";
import { createShellTools } from "../shell/tools.mjs";
import { createWebTools } from "../web/tools.mjs";

export function createMarchCustomTools({ cwd, engine, ui, memoryTools = [], skillTools = [], shellRuntime = null, lspService = null, mcpTools = [], webTools = [], permissionController = null }) {
  const openFileTool = defineTool({
    name: "open_file",
    label: "Open File",
    description:
      "Add a file to your working set. The file content (with absolute path and line numbers) will be injected into [open_files] in the context and kept up-to-date automatically. Use this before editing any file.",
    parameters: Type.Object({
      path: Type.String({ description: "Absolute or relative path to the file" }),
    }),
    execute: async (_toolCallId, params) => {
      const absPath = engine.resolvePath(params.path);
      if (engine.isOpen(absPath)) {
        return toolText(`${absPath} is already open.`, { path: absPath });
      }
      if (!existsSync(absPath)) {
        return toolText(`Error: file not found: ${absPath}`, { error: true });
      }
      try {
        const { content, lineCount } = engine.openFile(absPath);
        lspService?.touchFile?.(absPath);
        return toolText(
          `Opened ${absPath} (${lineCount} lines)\n\n--- ${absPath} (1-${lineCount}) ---\n${content.slice(0, 3000)}${content.length > 3000 ? "\n...(truncated, full file in context)" : ""}`,
          { path: absPath, lineCount },
        );
      } catch (err) {
        return toolText(`Error opening ${absPath}: ${err.message}`, { error: true });
      }
    },
  });

  const closeFileTool = defineTool({
    name: "close_file",
    label: "Close File",
    description:
      "Remove a file from your working set. It will no longer appear in [open_files]. Pinned files cannot be closed.",
    parameters: Type.Object({
      path: Type.String({ description: "Absolute or relative path to the file" }),
    }),
    execute: async (_toolCallId, params) => {
      const absPath = engine.resolvePath(params.path);
      const removed = engine.closeFile(absPath);
      if (!removed) {
        const entry = engine.getOpenFile(absPath);
        if (entry?.pinned) {
          return toolText(`${absPath} is pinned and cannot be closed. Use /unpin first.`, { pinned: true });
        }
        return toolText(`${absPath} is not in the open files set.`, { path: absPath });
      }
      return toolText(`Closed ${absPath}.`, { path: absPath });
    },
  });

  const editFileTool = createEditFileTool({ engine, ui, lspService });

  const platformTools = [];
  if (process.platform === "win32") {
    const psPath = findPowerShell();
    if (psPath) {
      const psDef = createBashToolDefinition(cwd, { shellPath: psPath });
      platformTools.push({
        ...psDef,
        name: "powershell",
        label: "PowerShell",
        description:
          "Execute a PowerShell command in the current working directory. This is the recommended shell on Windows. " +
          "Returns stdout and stderr. Output is truncated to last 200 lines or 64KB. " +
          "Optionally provide a timeout in seconds.",
        parameters: Type.Object({
          command: Type.String({ description: "PowerShell command to execute" }),
          timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (optional, no default timeout)" })),
        }),
        promptSnippet: "Execute PowerShell commands (Get-ChildItem, Select-String, Get-Content, etc.)",
      });
    }
  }

  const tools = [
    openFileTool,
    closeFileTool,
    editFileTool,
    ...platformTools,
    ...createShellTools(shellRuntime),
    ...memoryTools,
    ...skillTools,
    ...mcpTools,
    ...webTools,
  ];

  if (!permissionController) return tools;

  return tools.map((tool) => {
    const execute = tool.execute;
    if (!execute) return tool;
    const wrapped = async (toolCallId, params) => {
      const decision = await permissionController.requestApproval(
        tool.name,
        params,
        ui.requestPermission
          ? (ctx) => ui.requestPermission(ctx)
          : null,
      );
      if (decision.behavior === "deny") {
        return toolText(`Permission denied: ${decision.message}`, { error: true, permissionDenied: true });
      }
      return execute(toolCallId, params);
    };
    return { ...tool, execute: wrapped };
  });
}

function findPowerShell() {
  for (const name of ["pwsh.exe", "powershell.exe"]) {
    try {
      const result = spawnSync("where", [name], { encoding: "utf-8", timeout: 5000 });
      if (result.status === 0 && result.stdout) {
        const first = result.stdout.trim().split(/\r?\n/)[0];
        if (first && existsSync(first)) return first;
      }
    } catch {}
  }
  return null;
}

function toolText(text, details = {}) {
  return { content: [{ type: "text", text }], details };
}
