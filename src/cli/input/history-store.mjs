import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const HISTORY_VERSION = 1;
const MAX_HISTORY_ITEMS = 100;
const LOCK_WAIT_MS = 2000;
const LOCK_STALE_MS = 5000;

export function createInputHistoryStore({ path, maxItems = MAX_HISTORY_ITEMS } = {}) {
  return {
    load() {
      if (!path || !existsSync(path)) return [];
      try {
        const data = JSON.parse(readFileSync(path, "utf8"));
        const items = Array.isArray(data?.items) ? data.items : [];
        return normalizeItems(items, maxItems);
      } catch {
        return [];
      }
    },

    save(items) {
      if (!path) return;
      const normalized = normalizeItems(items, maxItems);
      withHistoryLock(path, () => {
        const merged = mergeItems(normalized, this.load(), maxItems);
        writeHistoryFile(path, merged);
      });
    },
  };
}

function normalizeItems(items, maxItems) {
  return items
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function mergeItems(primaryItems, existingItems, maxItems) {
  const merged = [];
  const seen = new Set();
  for (const item of [...primaryItems, ...existingItems]) {
    if (seen.has(item)) continue;
    seen.add(item);
    merged.push(item);
    if (merged.length >= maxItems) break;
  }
  return merged;
}

function writeHistoryFile(path, items) {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify({ version: HISTORY_VERSION, items }, null, 2)}\n`;
  writeFileSync(tmpPath, payload, "utf8");
  renameSync(tmpPath, path);
}

function withHistoryLock(path, fn) {
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  const fd = acquireLock(lockPath);
  try {
    return fn();
  } finally {
    closeSync(fd);
    try { unlinkSync(lockPath); } catch {}
  }
}

function acquireLock(lockPath) {
  const start = Date.now();
  while (true) {
    try {
      const fd = openSync(lockPath, "wx");
      writeFileSync(fd, `${process.pid}\n`, "utf8");
      return fd;
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
      removeStaleLock(lockPath);
      if (Date.now() - start >= LOCK_WAIT_MS) throw err;
      sleepSync(25);
    }
  }
}

function removeStaleLock(lockPath) {
  try {
    if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) unlinkSync(lockPath);
  } catch {}
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
