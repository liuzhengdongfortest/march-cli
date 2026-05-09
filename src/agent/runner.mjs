import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "child_process";
import { getModel } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  createBashToolDefinition,
  defineTool,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { ContextEngine } from "../context/engine.mjs";

const LINE_RANGE_RE = /^(\d+)(?:\s*-\s*(\d+))?$/;

function resolveApiKey(provider) {
  const envMap = {
    deepseek: "DEEPSEEK_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
  };
  const envVar = envMap[provider] ?? `${provider.toUpperCase()}_API_KEY`;
  const key = process.env[envVar];
  if (!key) throw new Error(`${envVar} environment variable is not set.`);
  return key;
}

export async function createRunner({ cwd, modelId, provider = "deepseek", stateRoot, ui, skills, skillPool = [], pins, graph = null, glossary = null, memoryTools = [], skillTools = [], namespace = "" }) {
  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey(provider, resolveApiKey(provider));

  const modelRegistry = ModelRegistry.create(authStorage);
  const model = modelRegistry.find(provider, modelId) ?? getModel(provider, modelId);
  if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true, reserveTokens: 262144, keepRecentTokens: 32768 },
    retry: { enabled: true, maxRetries: 1 },
  });

  const engine = new ContextEngine({ cwd, modelId, provider, skills, skillPool, pins, graph, glossary, namespace });

  // ── Custom tools ───────────────────────────────────────────────────

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

  // On Windows, create a PowerShell tool reusing Pi's bash infrastructure
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

  const customTools = [openFileTool, closeFileTool, editFileTool, ...platformTools, ...memoryTools, ...skillTools];

  engine.setToolDefs(customTools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters ? describeParams(t.parameters) : null,
  })));

  const { session } = await createAgentSession({
    cwd,
    agentDir: stateRoot,
    model,
    thinkingLevel: "medium",
    authStorage,
    modelRegistry,
    customTools,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager,
  });

  return {
    engine,
    session,

    async runTurn(prompt, userMessage) {
      let draft = "";
      let summaryDraft = "";
      let thinkingText = "";
      let summarizing = false;
      ui.turnStart();

      const unsubscribe = session.subscribe((event) => {
        if (event.type === "message_update" && event.assistantMessageEvent) {
          const ae = event.assistantMessageEvent;
          if (ae.type === "text_delta") {
            if (summarizing) {
              summaryDraft += ae.delta;
            } else {
              draft += ae.delta;
              ui.textDelta(ae.delta);
            }
          }
          if (ae.type === "thinking_start" && !summarizing) {
            thinkingText = "";
            ui.thinkingStart();
          }
          if (ae.type === "thinking_delta" && !summarizing) {
            thinkingText += ae.delta;
            ui.thinkingDelta(ae.delta);
          }
          if (ae.type === "thinking_end" && !summarizing && thinkingText) {
            const tokens = Math.round(thinkingText.length / 4);
            ui.thinkingEnd(tokens);
            thinkingText = "";
          }
        }
        if (event.type === "tool_execution_start") {
          if (!summarizing) ui.toolStart(event.toolName, event.args);
        }
        if (event.type === "tool_execution_end") {
          if (!summarizing) ui.toolEnd(event.toolName, event.isError, event.result);
        }
        if (event.type === "compaction_end" && !event.aborted && event.result?.summary) {
          engine.recordCompaction(event.result.summary);
        }
      });

      try {
        await session.prompt(prompt);

        // Post-turn: inject summary prompt with tools + thinking stripped
        summarizing = true;
        ui.summaryStart();

        const originalTools = session.getActiveToolNames();
        const originalThinking = session.thinkingLevel;
        session.setActiveToolsByName([]);
        session.setThinkingLevel("off");

        try {
          await session.prompt(
            "[system]\nSummarize the work you just completed in 1-2 paragraphs for the next turn's context. " +
            "Focus on: what was accomplished, what decisions were made, and what's left to do. " +
            "Output ONLY the summary — no tools, no code, just the summary text.\n\n" +
            "Keep it under 1k tokens.",
          );
        } catch {
          if (!summaryDraft) {
            summaryDraft = draft.slice(0, 300) || "(no output)";
          }
        }

        session.setActiveToolsByName(originalTools);
        session.setThinkingLevel(originalThinking);
        ui.summaryDone();

        const summary = (summaryDraft || "(no summary)").slice(0, 4000);

        engine.recordTurn({
          userMessage: userMessage ?? prompt.slice(0, 300),
          summary,
          assistantMessage: draft,
        });

        return { draft, summary };
      } finally {
        ui.turnEnd();
        unsubscribe();
      }
    },

    abort() {
      return session.abort();
    },

    cycleThinkingLevel() {
      return session.cycleThinkingLevel();
    },

    getThinkingLevel() {
      return session.thinkingLevel;
    },

    dispose() {
      session.dispose();
    },
  };
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
