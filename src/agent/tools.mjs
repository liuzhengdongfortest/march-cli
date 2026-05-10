import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import {
  createBashToolDefinition,
  defineTool,
} from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { createShellTools } from "../shell/tools.mjs";
import { createWebTools } from "../web/tools.mjs";

const LINE_RANGE_RE = /^(\d+)(?:\s*-\s*(\d+))?$/;

export function createMarchCustomTools({ cwd, engine, ui, memoryTools = [], skillTools = [], shellRuntime = null, mcpTools = [], webTools = [], permissionController = null }) {
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

  const editFileTool = defineTool({
    name: "edit_file",
    label: "Edit File",
    description:
      "Replace text in an open file. oldString can be a line range (\"55-64\" or \"55\") or exact text. File must be in [open_files]. Use write for new files.",
    parameters: Type.Object({
      path: Type.String({ description: "Absolute or relative path. Must be in [open_files]." }),
      oldString: Type.String({
        description: 'Line range ("55-64" or "55") or exact text to replace',
      }),
      newString: Type.String({ description: "Replacement text" }),
    }),
    execute: async (_toolCallId, params) => {
      const absPath = engine.resolvePath(params.path);

      if (!engine.isOpen(absPath)) {
        return toolText(
          `Error: ${absPath} is not in [open_files]. Use open_file first.`,
          { error: true, requiresOpen: true },
        );
      }

      let oldText = params.oldString;
      const entry = engine.getOpenFile(absPath);
      const lines = entry.content.split("\n");

      const rangeMatch = oldText.trim().match(LINE_RANGE_RE);
      if (rangeMatch && !entry.content.includes(oldText)) {
        const startLine = parseInt(rangeMatch[1], 10);
        const endLine = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : startLine;
        if (startLine < 1 || endLine > lines.length || startLine > endLine) {
          return toolText(
            `Error: line range ${startLine}-${endLine} out of bounds (file has ${lines.length} lines)`,
            { error: true },
          );
        }
        oldText = lines.slice(startLine - 1, endLine).join("\n");
      }

      if (!entry.content.includes(oldText)) {
        return toolText(
          `Error: oldString not found in ${absPath}. File may have changed — check [open_files] for current content.`,
          { error: true },
        );
      }

      const newContent = entry.content.replace(oldText, params.newString);
      try {
        mkdirSync(dirname(absPath), { recursive: true });
        writeFileSync(absPath, newContent, "utf8");
        engine.openFile(absPath);
        ui.editDiff(absPath, formatDiff(oldText, params.newString));
        return toolText(`Edited ${absPath}`, { path: absPath });
      } catch (err) {
        return toolText(`Error writing ${absPath}: ${err.message}`, { error: true });
      }
    },
  });

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

export function formatDiff(oldText, newText) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const ctx = 3;
  const result = [];

  const ctxStart = Math.max(0, prefix - ctx);
  for (let i = ctxStart; i < prefix; i++) {
    result.push({ type: "ctx", text: oldLines[i], lineNum: i + 1 });
  }

  const oldEnd = oldLines.length - suffix;
  for (let i = prefix; i < oldEnd; i++) {
    result.push({ type: "del", text: oldLines[i], lineNum: i + 1 });
  }

  const newEnd = newLines.length - suffix;
  for (let i = prefix; i < newEnd; i++) {
    result.push({ type: "add", text: newLines[i], lineNum: i + 1 });
  }

  const postStart = oldLines.length - suffix;
  const postEnd = Math.min(oldLines.length, postStart + ctx);
  for (let i = postStart; i < postEnd; i++) {
    result.push({ type: "ctx", text: oldLines[i], lineNum: i + 1 });
  }

  return result;
}
