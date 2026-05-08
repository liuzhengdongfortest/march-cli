import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { getModel } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  defineTool,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { ContextEngine } from "../context/engine.mjs";

const LINE_RANGE_RE = /^(\d+)(?:\s*-\s*(\d+))?$/;

export async function createRunner({ cwd, modelId, stateRoot, ui, skills, pins, graph = null, glossary = null, memoryTools = [], skillTools = [] }) {
  const provider = "deepseek";
  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey(provider, process.env.DEEPSEEK_API_KEY);

  const modelRegistry = ModelRegistry.create(authStorage);
  const model = modelRegistry.find(provider, modelId) ?? getModel(provider, modelId);
  if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 1 },
  });

  const engine = new ContextEngine({ cwd, modelId, provider, skills, pins, graph, glossary });
  const turnState = { summary: null, summaryCalled: false };

  // ── Custom tools ───────────────────────────────────────────────────

  const summaryTool = defineTool({
    name: "send_turn_summary",
    label: "Send Turn Summary",
    description:
      "MANDATORY at the end of every turn. Record a concise summary of what you accomplished. Your turn is not complete until you call this.",
    parameters: Type.Object({
      summary: Type.String({ description: "Concise summary (1-5 sentences)" }),
    }),
    execute: async (_toolCallId, params) => {
      if (turnState.summaryCalled) {
        turnState.summary = params.summary;
        return toolText("Summary updated. Turn is complete — do not call this tool again.", { summary: params.summary });
      }
      turnState.summary = params.summary;
      turnState.summaryCalled = true;
      return toolText("Turn summary recorded. Turn is complete.", { summary: params.summary });
    },
  });

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
      "Replace text in an open file. oldString can be a line range (\"55-64\" or \"55\") or exact text. File must be in [open_files]. Use write_file for new files.",
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

      // Try line-range expansion (only if oldText isn't already in the file)
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
        // Refresh cached content
        engine.openFile(absPath);
        ui.editDiff(absPath, formatDiff(oldText, params.newString));
        return toolText(`Edited ${absPath}`, { path: absPath });
      } catch (err) {
        return toolText(`Error writing ${absPath}: ${err.message}`, { error: true });
      }
    },
  });

  const customTools = [summaryTool, openFileTool, closeFileTool, editFileTool, ...memoryTools, ...skillTools];

  engine.setToolDefs(customTools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters ? describeParams(t.parameters) : null,
  })));

  const { session } = await createAgentSession({
    cwd,
    agentDir: stateRoot,
    model,
    thinkingLevel: "off",
    authStorage,
    modelRegistry,
    customTools,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager,
  });

  return {
    engine,
    session,

    async runTurn(prompt) {
      turnState.summary = null;
      turnState.summaryCalled = false;
      let draft = "";
      ui.turnStart();

      const unsubscribe = session.subscribe((event) => {
        if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
          draft += event.assistantMessageEvent.delta;
          ui.textDelta(event.assistantMessageEvent.delta);
        }
        if (event.type === "tool_execution_start") {
          ui.toolStart(event.toolName, event.args);
        }
        if (event.type === "tool_execution_end") {
          ui.toolEnd(event.toolName, event.isError);
        }
      });

      try {
        await session.prompt(prompt);

        if (!turnState.summaryCalled) {
          ui.status("send_turn_summary not called — enforcing");
          try {
            await session.prompt(
              "[system]\nYou forgot to call send_turn_summary. Call it ONCE with a summary, then stop — the turn ends after the tool result.",
            );
          } catch {
            if (!turnState.summary) {
              turnState.summary = draft.slice(0, 300) || "(no output)";
            }
          }
        }

        engine.recordTurn({
          userMessage: prompt,
          summary: turnState.summary ?? "(no summary)",
        });

        return { draft, summary: turnState.summary };
      } finally {
        ui.turnEnd();
        unsubscribe();
      }
    },

    dispose() {
      session.dispose();
    },
  };
}

function toolText(text, details = {}) {
  return { content: [{ type: "text", text }], details };
}

function describeParams(schema) {
  if (!schema || !schema.properties) return {};
  const out = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    out[key] = prop.description ?? key;
  }
  return out;
}

function formatDiff(oldText, newText) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Find common prefix
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix++;
  }

  // Find common suffix
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

  // Pre-context
  const ctxStart = Math.max(0, prefix - ctx);
  for (let i = ctxStart; i < prefix; i++) {
    result.push({ type: "ctx", text: oldLines[i] });
  }

  // Removed lines
  const oldEnd = oldLines.length - suffix;
  for (let i = prefix; i < oldEnd; i++) {
    result.push({ type: "del", text: oldLines[i] });
  }

  // Added lines
  const newEnd = newLines.length - suffix;
  for (let i = prefix; i < newEnd; i++) {
    result.push({ type: "add", text: newLines[i] });
  }

  // Post-context
  const postStart = oldLines.length - suffix;
  const postEnd = Math.min(oldLines.length, postStart + ctx);
  for (let i = postStart; i < postEnd; i++) {
    result.push({ type: "ctx", text: oldLines[i] });
  }

  return result;
}
