import { URL } from "node:url";

export function normalizeRemoteMemorySources(config = {}) {
  const sources = Array.isArray(config.remoteMemories) ? config.remoteMemories : [];
  const normalized = [];
  const seen = new Set();
  for (const source of sources) {
    const item = normalizeRemoteMemorySource(source);
    if (!item || seen.has(item.name)) continue;
    seen.add(item.name);
    normalized.push(item);
  }
  return normalized;
}

export function normalizeRemoteMemorySource(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const name = normalizeSourceName(source.name);
  const parsed = parseRemoteMemoryUrl(source.url ?? source.baseUrl, { token: source.token });
  if (!name || !parsed.url) return null;
  return { name, url: parsed.url, token: parsed.token ?? null };
}

export function parseRemoteMemoryUrl(rawUrl, { token = null } = {}) {
  try {
    const parsed = new URL(String(rawUrl ?? ""));
    const urlToken = parsed.searchParams.get("token") || token || null;
    parsed.searchParams.delete("token");
    parsed.hash = "";
    return { url: parsed.toString().replace(/\/$/, ""), token: urlToken };
  } catch {
    return { url: null, token: token || null };
  }
}

export function normalizeSourceName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function defaultRemoteMemoryName(url) {
  try {
    const parsed = new URL(url);
    return normalizeSourceName(parsed.hostname || "remote-memory") || "remote-memory";
  } catch {
    return "remote-memory";
  }
}
