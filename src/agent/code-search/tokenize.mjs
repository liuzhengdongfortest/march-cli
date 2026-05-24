const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "with",
]);

export function tokenize(text) {
  const raw = String(text ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-./\\:]+/g, " ")
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
  return raw.filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function uniqueTokens(text) {
  return [...new Set(tokenize(text))];
}
