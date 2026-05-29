export const BROWSER_OUTPUT_CHAR_LIMIT = 10_000;
export const BROWSER_COLLECTION_ITEM_LIMIT = 100;
export const BROWSER_OBJECT_KEY_LIMIT = 100;
export const BROWSER_SERIALIZE_DEPTH_LIMIT = 6;

export function truncateText(value, limit = BROWSER_OUTPUT_CHAR_LIMIT) {
  const text = String(value ?? "");
  if (text.length <= limit) return text;
  const marker = `\n[truncated browser output: ${text.length} chars -> ${limit} chars]`;
  return `${text.slice(0, Math.max(0, limit - marker.length))}${marker}`;
}

export function truncateToolText(text, limit = BROWSER_OUTPUT_CHAR_LIMIT) {
  const value = String(text ?? "");
  if (value.length <= limit) return { text: value, truncated: false, originalLength: value.length, returnedLength: value.length };
  const marker = `\n[truncated browser tool output: ${value.length} chars -> ${limit} chars]`;
  const returned = `${value.slice(0, Math.max(0, limit - marker.length))}${marker}`;
  return { text: returned, truncated: true, originalLength: value.length, returnedLength: returned.length };
}
