import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "./tool-result.mjs";
import { formatAppliedDiff, formatDiff } from "./editing/diff-format.mjs";
import { buildDiagnosticsForPath } from "../context/diagnostics.mjs";

export { formatDiff } from "./editing/diff-format.mjs";

const PATCH_MODE = "patch";
const WRITE_MODE = "write";
const OVERWRITE_MODE = "overwrite";

const replaceTextEditSchema = Type.Object({
  type: Type.Literal("replace_text"),
  oldText: Type.String({ description: "Exact text to replace. Must match exactly once in the original file." }),
  newText: Type.String({ description: "Replacement text" }),
});

const replaceRangeEditSchema = Type.Object({
  type: Type.Literal("replace_range"),
  startLine: Type.Number({ description: "1-based inclusive start line" }),
  endLine: Type.Number({ description: "1-based inclusive end line. This line is deleted too; keep it out of the range or include it in newText if it should remain." }),
  newText: Type.String({ description: "Replacement text. Omit a trailing newline unless intentionally adding a blank line." }),
});

export function createEditFileTool({ engine, ui, lspService = null }) {
  return defineTool({
    name: "edit_file",
    label: "Edit File",
    description:
      "Single file write tool. Use mode=patch with edits[] for targeted edits. " +
      "Use mode=write with content for new files. Use mode=overwrite with content for full-file replacement.",
    parameters: Type.Object({
      path: Type.String({ description: "Absolute or relative path" }),
      mode: Type.Optional(Type.Union([
        Type.Literal(PATCH_MODE),
        Type.Literal(WRITE_MODE),
        Type.Literal(OVERWRITE_MODE),
      ], { description: "patch (default), write, or overwrite" })),
      edits: Type.Optional(Type.Array(Type.Union([replaceTextEditSchema, replaceRangeEditSchema]), {
        description: "Patch edits. replace_text uses exact text; replace_range uses 1-based inclusive line numbers and deletes the endLine content too.",
      })),
      content: Type.Optional(Type.String({ description: "Full file content for mode=write or mode=overwrite" })),
    }),
    execute: async (_toolCallId, params) => executeEditFile({ params, engine, ui, lspService }),
  });
}

export async function executeEditFile({ params, engine, ui, lspService = null }) {
  const absPath = engine.resolvePath(params.path);
  const mode = params.mode ?? PATCH_MODE;

  if (mode === WRITE_MODE || mode === OVERWRITE_MODE) {
    return await writeFullFile({ absPath, path: params.path, content: params.content, mode, engine, lspService });
  }
  if (mode !== PATCH_MODE) return toolText(`Error: unsupported edit_file mode: ${mode}`, { error: true });
  return await patchFile({ absPath, path: params.path, edits: params.edits, engine, ui, lspService });
}

async function writeFullFile({ absPath, path, content, mode, engine, lspService }) {
  if (typeof content !== "string") {
    return toolText(`Error: content is required for mode=${mode}`, { error: true });
  }
  if (mode === WRITE_MODE && existsSync(absPath)) {
    return toolText(`Error: ${absPath} already exists. Use mode=overwrite to replace it.`, { error: true });
  }
  try {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, content, "utf8");
    lspService?.touchFile?.(absPath);

    return await toolTextWithDiagnostics(`${mode === WRITE_MODE ? "Wrote" : "Overwrote"} ${path}`, { path: absPath }, { lspService, path: absPath });
  } catch (err) {
    return toolText(`Error writing ${absPath}: ${err.message}`, { error: true });
  }
}

async function patchFile({ absPath, path, edits, engine, ui, lspService }) {
  if (!existsSync(absPath)) {
    return toolText(`Error: ${absPath} does not exist. Use mode=write to create it.`, { error: true });
  }
  if (!Array.isArray(edits) || edits.length === 0) {
    return toolText("Error: mode=patch requires at least one edit", { error: true });
  }

  const content = readFileSync(absPath, "utf8");
  const prepared = preparePatchEdits(content, edits, absPath);
  if (prepared.error) return toolText(prepared.error, { error: true });

  const newContent = applyPreparedEdits(content, prepared.edits);
  try {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, newContent, "utf8");
    lspService?.touchFile?.(absPath);
    ui.editDiff(absPath, prepared.edits.flatMap((edit) => formatDiff(edit.oldText, edit.newText, { startLine: edit.startLine })));
    return await toolTextWithDiagnostics(`Edited ${absPath}\n\n${formatAppliedDiff(prepared.edits)}`, { path: absPath, edits: prepared.edits.length }, { lspService, path: absPath });
  } catch (err) {
    return toolText(`Error writing ${absPath}: ${err.message}`, { error: true });
  }
}

async function toolTextWithDiagnostics(text, details, { lspService, path, timeoutMs = 3000, intervalMs = 150 } = {}) {
  const diagnostics = await waitForDiagnosticsForPath({ lspService, path, timeoutMs, intervalMs });
  return toolText(diagnostics ? `${text}\n\n${diagnostics}` : text, details);
}

async function waitForDiagnosticsForPath({ lspService, path, timeoutMs, intervalMs }) {
  if (!lspService?.snapshot || !path) return "";
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const diagnostics = buildDiagnosticsForPath({ snapshot: lspService.snapshot(), path });
    if (diagnostics) return diagnostics;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return "";
    await sleep(Math.min(intervalMs, remaining));
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function preparePatchEdits(content, edits, path = "file") {
  const prepared = [];
  for (const edit of edits) {
    const next = prepareOneEdit(content, edit, path);
    if (next.error) return next;
    prepared.push(next.edit);
  }
  prepared.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < prepared.length; i++) {
    if (prepared[i].start < prepared[i - 1].end) {
      return { error: `Error: edits overlap in ${path}` };
    }
  }
  return { edits: prepared };
}

function prepareOneEdit(content, edit, path) {
  if (edit?.type === "replace_text") return prepareTextEdit(content, edit, path);
  if (edit?.type === "replace_range") return prepareRangeEdit(content, edit, path);
  return { error: `Error: unsupported edit type: ${edit?.type}` };
}

function prepareTextEdit(content, edit, path) {
  if (!edit.oldText) return { error: "Error: replace_text oldText must be non-empty" };
  const first = content.indexOf(edit.oldText);
  if (first < 0) return { error: formatMissingOldTextError(content, edit.oldText, path) };
  const second = content.indexOf(edit.oldText, first + edit.oldText.length);
  if (second >= 0) return { error: `Error: oldText is not unique in ${path}. Use replace_range or include more context.` };
  return {
    edit: {
      start: first,
      end: first + edit.oldText.length,
      oldText: edit.oldText,
      newText: edit.newText,
      startLine: lineNumberForOffset(content, first),
    },
  };
}

function formatMissingOldTextError(content, oldText, path) {
  const candidate = findClosestTextCandidate(content, oldText);
  const lines = [`Error: oldText not found in ${path}. File may have changed.`];
  if (!candidate) return lines.join("\n");
  lines.push(
    "",
    "Closest candidate:",
    `lines ${candidate.startLine}-${candidate.endLine}, similarity ${candidate.score.toFixed(2)}`,
    "---",
    candidate.snippet,
    "---",
    `Use replace_range with startLine=${candidate.startLine} endLine=${candidate.endLine} if this is intended.`,
  );
  return lines.join("\n");
}

function findClosestTextCandidate(content, oldText) {
  const lines = content.split("\n");
  const oldLineCount = Math.max(1, oldText.split("\n").length);
  const windowSizes = [...new Set([oldLineCount - 1, oldLineCount, oldLineCount + 1])]
    .filter((size) => size > 0 && size <= lines.length);
  let best = null;
  for (const size of windowSizes) {
    for (let start = 0; start <= lines.length - size; start++) {
      const snippet = lines.slice(start, start + size).join("\n");
      const score = textSimilarity(oldText, snippet);
      if (!best || score > best.score) {
        best = { startLine: start + 1, endLine: start + size, score, snippet: truncateSnippet(snippet) };
      }
    }
  }
  return best?.score >= 0.2 ? best : null;
}

function textSimilarity(a, b) {
  const aTokens = tokenizeForSimilarity(a);
  const bTokens = tokenizeForSimilarity(b);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const counts = new Map();
  for (const token of aTokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  let common = 0;
  for (const token of bTokens) {
    const count = counts.get(token) ?? 0;
    if (count <= 0) continue;
    common++;
    counts.set(token, count - 1);
  }
  return (2 * common) / (aTokens.length + bTokens.length);
}

function tokenizeForSimilarity(text) {
  const tokens = String(text).toLowerCase().match(/[a-z0-9_]+/g);
  if (tokens?.length) return tokens;
  return String(text).replace(/\s+/g, "").split("").filter(Boolean);
}

function truncateSnippet(text) {
  const limit = 1200;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n...(snippet truncated)`;
}

function prepareRangeEdit(content, edit, path) {
  const lines = content.split("\n");
  const startLine = Math.trunc(edit.startLine);
  const endLine = Math.trunc(edit.endLine);
  if (startLine < 1 || endLine > lines.length || startLine > endLine) {
    return { error: `Error: line range ${startLine}-${endLine} out of bounds (file has ${lines.length} lines)` };
  }
  const oldText = lines.slice(startLine - 1, endLine).join("\n");
  const newText = normalizeRangeNewText(edit.newText, endLine, lines.length);
  return {
    edit: {
      start: offsetForLine(lines, startLine),
      end: offsetForLine(lines, startLine) + oldText.length,
      oldText,
      newText,
      startLine,
    },
  };
}

function normalizeRangeNewText(newText, endLine, lineCount) {
  if (endLine < lineCount && /\r?\n$/.test(newText)) return newText.replace(/\r?\n$/, "");
  return newText;
}

function lineNumberForOffset(content, offset) {
  let line = 1;
  for (let i = 0; i < offset; i++) if (content[i] === "\n") line++;
  return line;
}

function offsetForLine(lines, lineNumber) {
  let offset = 0;
  for (let i = 0; i < lineNumber - 1; i++) offset += lines[i].length + 1;
  return offset;
}

function applyPreparedEdits(content, edits) {
  let next = content;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    next = next.slice(0, edit.start) + edit.newText + next.slice(edit.end);
  }
  return next;
}
