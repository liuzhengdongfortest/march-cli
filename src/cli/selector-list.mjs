export function formatSelectorList({
  items = [],
  currentIndex = -1,
  emptyMessage = "(no items)",
  instruction,
  linePrefix = "",
  formatItem = (item) => String(item),
}) {
  if (!items.length) return [emptyMessage];
  const lines = items.map((item, index) => {
    const mark = index === currentIndex ? "*" : " ";
    return `${linePrefix}${mark} ${index + 1}. ${formatItem(item)}`;
  });
  if (instruction) lines.push(instruction);
  return lines;
}

export function findCurrentIndex(items, predicate) {
  if (!Array.isArray(items) || typeof predicate !== "function") return -1;
  return items.findIndex(predicate);
}
