export function parseMouseScroll(data) {
  const match = data.match(/^\x1b\[<(\d+);\d+;\d+[Mm]$/);
  if (!match) return null;
  const btn = parseInt(match[1], 10);
  if (btn === 64) return -1;
  if (btn === 65) return 1;
  return null;
}
