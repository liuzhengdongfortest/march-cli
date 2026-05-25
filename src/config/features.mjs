import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULTS = Object.freeze({
  "experimental.mcp": true,
  "experimental.web_search": true,
  "experimental.web_fetch": true,
  "experimental.shell": true,
  "ui.markdown_rendering": false,
  "ui.tool_expand_per_card": false,
  "agent.plan_mode": false,
  "agent.sub_agents": false,
  "agent.background_tasks": false,
  "agent.auto_retry": true,
});

/**
 * Load feature flags from ~/.march/features.toml.
 * Returns a frozen object with all known flags resolved to booleans.
 * Unknown keys in the file are ignored.
 *
 * TOML format (subset):
 *   # comment
 *   [section]
 *   key = true
 *   key = false
 */
export function loadFeatureFlags({
  homeDir = homedir(),
  readFileSyncImpl = readFileSync,
  existsSyncImpl = existsSync,
} = {}) {
  const path = join(homeDir, ".march", "features.toml");
  const overrides = loadToml(path, { readFileSyncImpl, existsSyncImpl });
  const resolved = { ...DEFAULTS };
  for (const [key, value] of Object.entries(overrides)) {
    if (key in resolved) resolved[key] = Boolean(value);
  }
  return Object.freeze(resolved);
}

export function isEnabled(flags, flag) {
  return Boolean(flags?.[flag]);
}

// ── Minimal TOML subset parser (sections, booleans, comments) ──
function loadToml(path, { readFileSyncImpl, existsSyncImpl }) {
  if (!existsSyncImpl(path)) return {};
  const src = readFileSyncImpl(path, "utf8");
  const result = {};
  let section = "";
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    // [section]
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim() + ".";
      continue;
    }

    // key = value
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = (section + line.slice(0, eq).trim());
    const value = line.slice(eq + 1).trim();
    if (value === "true") result[key] = true;
    else if (value === "false") result[key] = false;
    // ignore non-boolean values
  }
  return result;
}
