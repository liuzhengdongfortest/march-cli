import { existsSync } from "node:fs";
import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { createCommandExecTool } from "./command-exec-tool.mjs";
import { createEditFileTool } from "./file-edit-tool.mjs";
import { toolText } from "./tool-result.mjs";
import { createShellTools } from "../shell/tools.mjs";
import { createWebTools } from "../web/tools.mjs";

export function createMarchCustomTools({ cwd, engine, ui, memoryTools = [], skillTools = [], shellRuntime = null, lspService = null, mcpTools = [], webTools = [], permissionController = null }) {
  const openFileTool = defineTool({
    name: "open_file",
    label: "Open File",
    description:
      "Add one or more files to your working set. File content appears only in [open_files], not in the tool result.",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Absolute or relative path to one file" })),
      paths: Type.Optional(Type.Array(Type.String(), { description: "Absolute or relative paths to multiple files" })),
    }),
    execute: async (_toolCallId, params) => {
      const paths = normalizeToolPaths(params);
      if (paths.length === 0) return toolText("Error: path or paths is required", { error: true });
      const results = paths.map((path) => openOneFile(path));
      if (results.length === 1) return formatSingleOpenResult(results[0]);
      return formatBatchResult("open_file", results);
    },
  });

  const closeFileTool = defineTool({
    name: "close_file",
    label: "Close File",
    description:
      "Remove one or more files from your working set. Pinned files cannot be closed.",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Absolute or relative path to one file" })),
      paths: Type.Optional(Type.Array(Type.String(), { description: "Absolute or relative paths to multiple files" })),
    }),
    execute: async (_toolCallId, params) => {
      const paths = normalizeToolPaths(params);
      if (paths.length === 0) return toolText("Error: path or paths is required", { error: true });
      const results = paths.map((path) => closeOneFile(path));
      if (results.length === 1) return formatSingleCloseResult(results[0]);
      return formatBatchResult("close_file", results);
    },
  });

  function openOneFile(path) {
    const absPath = engine.resolvePath(path);
    if (engine.isOpen(absPath)) return { status: "already_open", path: absPath };
    if (!existsSync(absPath)) return { status: "error", path: absPath, message: "file not found" };
    try {
      const { lineCount } = engine.openFile(absPath);
      lspService?.touchFile?.(absPath);
      return { status: "opened", path: absPath, lineCount };
    } catch (err) {
      return { status: "error", path: absPath, message: err.message };
    }
  }

  function closeOneFile(path) {
    const absPath = engine.resolvePath(path);
    const removed = engine.closeFile(absPath);
    if (removed) return { status: "closed", path: absPath };
    const entry = engine.getOpenFile(absPath);
    if (entry?.pinned) return { status: "pinned", path: absPath, message: "pinned; use /unpin first" };
    return { status: "not_open", path: absPath };
  }

  const commandExecTool = createCommandExecTool({ cwd });
  const editFileTool = createEditFileTool({ engine, ui, lspService });

  const tools = [
    openFileTool,
    closeFileTool,
    commandExecTool,
    editFileTool,
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

function normalizeToolPaths(params) {
  const paths = [];
  if (typeof params.path === "string" && params.path.trim()) paths.push(params.path);
  if (Array.isArray(params.paths)) {
    for (const path of params.paths) {
      if (typeof path === "string" && path.trim()) paths.push(path);
    }
  }
  return [...new Set(paths)];
}

function formatSingleOpenResult(result) {
  if (result.status === "opened") return toolText(`Opened ${result.path} (${result.lineCount} lines)`, result);
  if (result.status === "already_open") return toolText(`${result.path} is already open.`, result);
  return toolText(`Error opening ${result.path}: ${result.message}`, { ...result, error: true });
}

function formatSingleCloseResult(result) {
  if (result.status === "closed") return toolText(`Closed ${result.path}.`, result);
  if (result.status === "pinned") return toolText(`${result.path} is pinned and cannot be closed. Use /unpin first.`, { ...result, pinned: true });
  return toolText(`${result.path} is not in the open files set.`, result);
}

function formatBatchResult(toolName, results) {
  const counts = new Map();
  for (const result of results) counts.set(result.status, (counts.get(result.status) ?? 0) + 1);
  const summary = [...counts.entries()].map(([status, count]) => `${count} ${status}`).join(", ");
  const lines = [`${toolName}: ${summary}`];
  for (const result of results) {
    const suffix = result.lineCount ? ` (${result.lineCount} lines)` : result.message ? `: ${result.message}` : "";
    lines.push(`- ${result.status}: ${result.path}${suffix}`);
  }
  return toolText(lines.join("\n"), { results, error: results.some((result) => result.status === "error") });
}
