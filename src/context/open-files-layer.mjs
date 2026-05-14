export function buildOpenFilesLayer(openFiles) {
  const blocks = [];
  for (const [path, entry] of openFiles) {
    const markers = [];
    if (entry.pinned) markers.push("pinned");
    if (entry.stale) markers.push("stale");
    const marker = markers.length > 0 ? ` (${markers.join(", ")})` : "";
    const header = `--- ${path} (${formatLineRange(entry.lineCount)})${marker} ---`;
    const warning = entry.stale
      ? "WARNING: This file may have been moved or deleted. The content below is the last known snapshot. If you no longer need this file, close it.\n"
      : "";
    blocks.push(`${header}\n${warning}${formatNumberedContent(entry.content)}`);
  }
  return `[open_files]\n${blocks.join("\n\n")}`;
}

function formatLineRange(lineCount) {
  return lineCount <= 0 ? "0 lines" : `1-${lineCount}`;
}

function formatNumberedContent(content) {
  if (!content) return "(empty)";
  return content.split("\n").map((line, index) => `${index + 1} | ${line}`).join("\n");
}
