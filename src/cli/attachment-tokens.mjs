export function resolveAttachmentTokens(text, tokens) {
  let resolved = text;
  for (const [token, marker] of tokens) {
    resolved = resolved.split(token).join(marker);
  }
  return resolved;
}

export function uniqueAttachmentToken(label, tokens) {
  if (!tokens.has(label)) return label;
  for (let i = 2; ; i++) {
    const candidate = label.replace(/\]$/, ` ${i}]`);
    if (!tokens.has(candidate)) return candidate;
  }
}

export function withLeadingSpace(currentText, text) {
  if (!String(currentText || "").trim()) return text;
  return ` ${text}`;
}
