export function formatDiff(oldText, newText, { startLine = 1 } = {}) {
  if (oldText === "") return newText === "" ? [] : newText.split("\n").map((text, i) => ({ type: "add", text, lineNum: startLine + i }));
  if (newText === "") return oldText.split("\n").map((text, i) => ({ type: "del", text, lineNum: startLine + i }));
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
  for (let i = ctxStart; i < prefix; i++) result.push({ type: "ctx", text: oldLines[i], lineNum: startLine + i });

  const oldEnd = oldLines.length - suffix;
  for (let i = prefix; i < oldEnd; i++) result.push({ type: "del", text: oldLines[i], lineNum: startLine + i });

  const newEnd = newLines.length - suffix;
  for (let i = prefix; i < newEnd; i++) result.push({ type: "add", text: newLines[i], lineNum: startLine + i });

  const postStart = oldLines.length - suffix;
  const postEnd = Math.min(oldLines.length, postStart + ctx);
  for (let i = postStart; i < postEnd; i++) result.push({ type: "ctx", text: oldLines[i], lineNum: startLine + i });
  return result;
}

export function countDiffChanges(diffLines) {
  let adds = 0, dels = 0;
  for (const line of diffLines) {
    if (line.type === "add") adds++;
    if (line.type === "del") dels++;
  }
  return { adds, dels };
}

export function formatAppliedDiff(edits) {
  const lines = ["[diff]"];
  for (const edit of edits) {
    const oldLineCount = edit.oldText.split("\n").length;
    lines.push(`@@ lines ${edit.startLine}-${edit.startLine + oldLineCount - 1} @@`);
    for (const line of formatDiff(edit.oldText, edit.newText, { startLine: edit.startLine })) {
      if (line.type === "ctx") lines.push(` ${line.lineNum}: ${line.text}`);
      if (line.type === "del") lines.push(`-${line.lineNum}: ${line.text}`);
      if (line.type === "add") lines.push(`+${line.lineNum}: ${line.text}`);
    }
  }
  return lines.join("\n");
}
