export function sliceLinesWithTail(baseLines, tailLine, range) {
  if (!range) return tailLine == null ? baseLines : [...baseLines, tailLine];

  const { start, end } = range;
  const visible = baseLines.slice(start, Math.min(end, baseLines.length));
  if (tailLine != null && end > baseLines.length) visible.push(tailLine);
  return visible;
}
