export function parseMouseEvent(data) {
  const match = data.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (!match) return null;
  const code = parseInt(match[1], 10);
  const col = parseInt(match[2], 10);
  const row = parseInt(match[3], 10);
  const final = match[4];

  if (code === 64 || code === 65) {
    return { type: "scroll", delta: code === 64 ? -1 : 1, col, row };
  }
  if (final === "m") return { type: "up", button: code & 3, col, row };
  if ((code & 32) === 32) return { type: "drag", button: code & 3, col, row };
  return { type: "down", button: code & 3, col, row };
}

export function parseMouseScroll(data) {
  const event = parseMouseEvent(data);
  return event?.type === "scroll" ? event.delta : null;
}
