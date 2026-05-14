import { mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

export function createModelContextDumper({ enabled = false, rootDir = "", now = () => new Date() } = {}) {
  let sequence = 0;
  return {
    enabled: Boolean(enabled),
    rootDir,
    dump({ kind = "model", prompt = "", metadata = {} } = {}) {
      if (!enabled) return null;
      sequence += 1;
      mkdirSync(rootDir, { recursive: true });
      const timestamp = now().toISOString();
      const filename = `${sanitizeTimestamp(timestamp)}-${String(sequence).padStart(4, "0")}-${sanitizeKind(kind)}.md`;
      const path = join(rootDir, filename);
      writeFileSync(path, `${formatHeader({ kind, timestamp, ...metadata })}\n\n${prompt}`, "utf8");
      return path;
    },
    dumpSidecar({ sourcePath, suffix, value } = {}) {
      if (!enabled || !sourcePath || !suffix) return null;
      const ext = extname(sourcePath);
      const stem = basename(sourcePath, ext);
      const path = join(rootDir, `${stem}-${sanitizeKind(suffix)}.json`);
      mkdirSync(rootDir, { recursive: true });
      writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      return path;
    },
  };
}

function formatHeader(metadata) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(metadata)) {
    if (value == null || value === "") continue;
    lines.push(`${key}: ${formatValue(value)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function formatValue(value) {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(String(value));
}

function sanitizeTimestamp(timestamp) {
  return timestamp.replace(/[:.]/g, "-");
}

function sanitizeKind(kind) {
  return String(kind).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "model";
}
