export function toolText(text, details = {}) {
  return { content: [{ type: "text", text }], details };
}
