import { tokenize } from "./tokenize.mjs";

export function rerankResults(results, query, { includeTests = false } = {}) {
  const queryTokens = new Set(tokenize(query));
  return results
    .map((result) => ({ ...result, score: applyBoosts(result.chunk, result.score, queryTokens, includeTests) }))
    .filter((result) => includeTests || !isTestPath(result.chunk.file_path))
    .sort((a, b) => b.score - a.score || a.chunk.file_path.localeCompare(b.chunk.file_path));
}

function applyBoosts(chunk, baseScore, queryTokens, includeTests) {
  let score = baseScore;
  const symbolTokens = new Set(tokenize(chunk.symbols.join(" ")));
  const pathTokens = new Set(tokenize(chunk.file_path));
  const identifierTokens = new Set(chunk.identifiers ?? []);

  score += overlap(queryTokens, symbolTokens) * 3.0;
  score += overlap(queryTokens, identifierTokens) * 1.5;
  score += overlap(queryTokens, pathTokens) * 1.0;
  if (chunk.kind === "function" || chunk.kind === "class") score += 0.75;
  if (isImplementationPath(chunk.file_path)) score += 0.5;
  if (!includeTests && isTestPath(chunk.file_path)) score -= 2.5;
  if (isVendorPath(chunk.file_path)) score -= 5;
  return score;
}

function overlap(a, b) {
  let count = 0;
  for (const token of a) if (b.has(token)) count += 1;
  return count;
}

function isImplementationPath(path) {
  return /(^|\/)src\//.test(path) || /(^|\/)lib\//.test(path);
}

function isTestPath(path) {
  return /(^|\/)(__tests__|test|tests|spec)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
}

function isVendorPath(path) {
  return /(^|\/)(node_modules|vendor|dist|build|coverage)(\/|$)/.test(path);
}
