import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const HISTORY_VERSION = 1;
const MAX_HISTORY_ITEMS = 100;

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
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify({ version: HISTORY_VERSION, items: normalized }, null, 2)}\n`, "utf8");
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
