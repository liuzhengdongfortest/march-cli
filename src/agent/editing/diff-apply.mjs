/**
 * Apply unified-diff-like patches to in-memory text content.
 * Used by file-edit-tool for dry-run validation and safe application.
 */
export function applyReplaceTextPatch(text, oldText, newText) {
  const idx = text.indexOf(oldText);
  if (idx === -1) {
    return { ok: false, error: `Text not found in content` };
  }
  const before = text.slice(0, idx);
  const after = text.slice(idx + oldText.length);
  return { ok: true, result: before + newText + after };
}

export function applyReplaceRangePatch(text, startLine, endLine, newText) {
  const lines = text.split("\n");
  if (startLine < 1 || startLine > lines.length) {
    return { ok: false, error: `startLine ${startLine} out of range (1-${lines.length})` };
  }
  if (endLine < startLine || endLine > lines.length) {
    return { ok: false, error: `endLine ${endLine} out of range (${startLine}-${lines.length})` };
  }
  const zeroBasedStart = startLine - 1;
  const before = lines.slice(0, zeroBasedStart);
  const after = lines.slice(endLine);
  const newLines = newText === "" ? [] : newText.split("\n");
  return { ok: true, result: [...before, ...newLines, ...after].join("\n") };
}
