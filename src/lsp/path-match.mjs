import { normalize } from "node:path";

export function sameLspPath(left, right) {
  return lspPathKey(left) === lspPathKey(right);
}

export function lspPathKey(path) {
  const normalized = normalize(String(path ?? ""));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
