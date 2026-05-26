export function planVisibleBlockEntries(layouts, range) {
  if (!range) return layouts.flatMap((layout) => layout.entries);

  const visible = [];
  let cursor = 0;
  for (const layout of layouts) {
    const blockStart = cursor;
    const blockEnd = cursor + layout.lineCount;
    cursor = blockEnd;
    if (blockEnd <= range.start) continue;
    if (blockStart >= range.end) break;
    const start = Math.max(0, range.start - blockStart);
    const end = Math.min(layout.lineCount, range.end - blockStart);
    visible.push(...layout.entries.slice(start, end));
  }
  return visible;
}

export function sumLayoutLines(layouts) {
  let total = 0;
  for (const layout of layouts) total += layout.lineCount;
  return total;
}

export function appendTailEntry(entries, tailLine, baseRow) {
  if (tailLine == null) return entries;
  return [...entries, { line: tailLine, source: null, codeSource: null, block: null, baseRow }];
}
