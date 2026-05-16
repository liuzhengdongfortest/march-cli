import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Priority (last wins):
 *   1. ~/.march/config — legacy global defaults
 *   2. ~/.march/config.json — global config
 *   3. <cwd>/.marchrc — legacy project overrides
 *   4. <cwd>/.march/config — legacy project dir overrides
 *   5. <cwd>/.march/config.json — project config
 * Scalar values override. Array values (skills) concatenate.
 */
export function loadConfig(cwd, { homeDir = homedir() } = {}) {
  const layers = [];

  // 1. Global config: ~/.march/config
  const globalPath = join(homeDir, ".march", "config");
  layers.push(loadJson(globalPath));

  layers.push(loadJson(join(homeDir, ".march", "config.json")));

  // 2. Project config: <cwd>/.marchrc
  layers.push(loadJson(join(cwd, ".marchrc")));

  // 3. Project dir config: <cwd>/.march/config
  layers.push(loadJson(join(cwd, ".march", "config")));
  layers.push(loadJson(join(cwd, ".march", "config.json")));

  return mergeLayers(layers);
}

function loadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function mergeLayers(layers) {
  const result = {
    model: null,
    provider: null,
    providers: {},
    webSearch: { provider: null, providers: {} },
    skills: [],
    maxTurns: null,
    trimBatch: null,
    memoryRoot: null,
  };

  for (const layer of layers) {
    if (!layer) continue;
    if (layer.model != null) result.model = layer.model;
    if (layer.provider) result.provider = layer.provider;
    if (layer.providers && typeof layer.providers === "object" && !Array.isArray(layer.providers)) {
      result.providers = mergeProviders(result.providers, layer.providers);
    }
    if (layer.webSearch && typeof layer.webSearch === "object" && !Array.isArray(layer.webSearch)) {
      result.webSearch = mergeWebSearch(result.webSearch, layer.webSearch);
    }
    if (layer.memoryRoot) result.memoryRoot = layer.memoryRoot;
    if (Array.isArray(layer.skills)) {
      for (const s of layer.skills) {
        if (!result.skills.includes(s)) result.skills.push(s);
      }
    }
  }

  return result;
}

function mergeWebSearch(current, next) {
  const merged = {
    provider: next.provider ?? current.provider ?? null,
    providers: { ...(current.providers ?? {}) },
  };
  if (next.providers && typeof next.providers === "object" && !Array.isArray(next.providers)) {
    for (const [id, profile] of Object.entries(next.providers)) {
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) continue;
      merged.providers[id] = {
        ...(merged.providers[id] ?? {}),
        ...profile,
      };
    }
  }
  return merged;
}

function mergeProviders(current, next) {
  const merged = { ...current };
  for (const [id, profile] of Object.entries(next)) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) continue;
    merged[id] = {
      ...(merged[id] ?? {}),
      ...profile,
      auth: {
        ...(merged[id]?.auth ?? {}),
        ...(profile.auth ?? {}),
      },
    };
  }
  return merged;
}
