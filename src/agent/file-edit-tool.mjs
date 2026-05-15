import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "./tool-result.mjs";

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
  endLine: Type.Number({ description: "1-based inclusive end line" }),
  newText: Type.String({ description: "Replacement text" }),
});

export function createEditFileTool({ engine, ui, lspService = null }) {
  return defineTool({
    name: "edit_file",
    label: "Edit File",
    description:
      "Single file write tool. Use mode=patch with edits[] for targeted edits in [open_files]. " +
      "Use mode=write with content for new files. Use mode=overwrite with content for full-file replacement.",
    parameters: Type.Object({
      path: Type.String({ description: "Absolute or relative path" }),
      mode: Type.Optional(Type.Union([
        Type.Literal(PATCH_MODE),
        Type.Literal(WRITE_MODE),
        Type.Literal(OVERWRITE_MODE),
      ], { description: "patch (default), write, or overwrite" })),
      edits: Type.Optional(Type.Array(Type.Union([replaceTextEditSchema, replaceRangeEditSchema]), {
        description: "Patch edits. replace_text uses exact text; replace_range uses 1-based inclusive line numbers from [open_files].",
      })),
      content: Type.Optional(Type.String({ description: "Full file content for mode=write or mode=overwrite" })),
    }),
    execute: async (_toolCallId, params) => executeEditFile({ params, engine, ui, lspService }),
  });
}

export function executeEditFile({ params, engine, ui, lspService = null }) {
  const absPath = engine.resolvePath(params.path);
  const mode = params.mode ?? PATCH_MODE;

  if (mode === WRITE_MODE || mode === OVERWRITE_MODE) {
    return writeFullFile({ absPath, path: params.path, content: params.content, mode, engine, lspService });
  }
  if (mode !== PATCH_MODE) return toolText(`Error: unsupported edit_file mode: ${mode}`, { error: true });
  return patchOpenFile({ absPath, path: params.path, edits: params.edits, engine, ui, lspService });
}

function writeFullFile({ absPath, path, content, mode, engine, lspService }) {
  if (typeof content !== "string") {
    return toolText(`Error: content is required for mode=${mode}`, { error: true });
  }
  if (mode === WRITE_MODE && existsSync(absPath)) {
    return toolText(`Error: ${absPath} already exists. Use mode=overwrite to replace it.`, { error: true });
  }
  try {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, content, "utf8");
    if (engine.isOpen(absPath)) engine.openFile(absPath);
    lspService?.touchFile?.(absPath);
    return toolText(`${mode === WRITE_MODE ? "Wrote" : "Overwrote"} ${path}`, { path: absPath });
  } catch (err) {
    return toolText(`Error writing ${absPath}: ${err.message}`, { error: true });
  }
}

function patchOpenFile({ absPath, edits, engine, ui, lspService }) {
  if (!engine.isOpen(absPath)) {
    return toolText(`Error: ${absPath} is not in [open_files]. Use open_file first.`, { error: true, requiresOpen: true });
  }
  if (!Array.isArray(edits) || edits.length === 0) {
    return toolText("Error: mode=patch requires at least one edit", { error: true });
  }

  const entry = engine.getOpenFile(absPath);
  const prepared = preparePatchEdits(entry.content, edits, absPath);
  if (prepared.error) return toolText(prepared.error, { error: true });

  const newContent = applyPreparedEdits(entry.content, prepared.edits);
  try {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, newContent, "utf8");
    engine.openFile(absPath);
    lspService?.touchFile?.(absPath);
    for (const edit of prepared.edits) ui.editDiff(absPath, formatDiff(edit.oldText, edit.newText));
    return toolText(`Edited ${absPath}`, { path: absPath, edits: prepared.edits.length });
  } catch (err) {
    return toolText(`Error writing ${absPath}: ${err.message}`, { error: true });
  }
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
  if (first < 0) return { error: `Error: oldText not found in ${path}. File may have changed.` };
  const second = content.indexOf(edit.oldText, first + edit.oldText.length);
  if (second >= 0) return { error: `Error: oldText is not unique in ${path}. Use replace_range or include more context.` };
  return {
    edit: {
      start: first,
      end: first + edit.oldText.length,
      oldText: edit.oldText,
      newText: edit.newText,
    },
  };
}

function prepareRangeEdit(content, edit, path) {
  const lines = content.split("\n");
  const startLine = Math.trunc(edit.startLine);
  const endLine = Math.trunc(edit.endLine);
  if (startLine < 1 || endLine > lines.length || startLine > endLine) {
    return { error: `Error: line range ${startLine}-${endLine} out of bounds (file has ${lines.length} lines)` };
  }
  const oldText = lines.slice(startLine - 1, endLine).join("\n");
  return {
    edit: {
      start: offsetForLine(lines, startLine),
      end: offsetForLine(lines, startLine) + oldText.length,
      oldText,
      newText: edit.newText,
    },
  };
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

export function formatDiff(oldText, newText) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;

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
  for (let i = ctxStart; i < prefix; i++) result.push({ type: "ctx", text: oldLines[i], lineNum: i + 1 });

  const oldEnd = oldLines.length - suffix;
  for (let i = prefix; i < oldEnd; i++) result.push({ type: "del", text: oldLines[i], lineNum: i + 1 });

  const newEnd = newLines.length - suffix;
  for (let i = prefix; i < newEnd; i++) result.push({ type: "add", text: newLines[i], lineNum: i + 1 });

  const postStart = oldLines.length - suffix;
  const postEnd = Math.min(oldLines.length, postStart + ctx);
  for (let i = postStart; i < postEnd; i++) result.push({ type: "ctx", text: oldLines[i], lineNum: i + 1 });
  return result;
}
