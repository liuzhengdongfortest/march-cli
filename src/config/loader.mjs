import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Priority (last wins):
 *   1. ~/.march/config — global defaults
 *   2. <cwd>/.marchrc — project overrides
 *   3. <cwd>/.march/config — project dir overrides
 * Scalar values override. Array values (skills, pins) concatenate.
 */
export function loadConfig(cwd) {
  const layers = [];

  // 1. Global config: ~/.march/config
  const globalPath = join(homedir(), ".march", "config");
  layers.push(loadJson(globalPath));

  // 2. Project config: <cwd>/.marchrc
  layers.push(loadJson(join(cwd, ".marchrc")));

  // 3. Project dir config: <cwd>/.march/config
  layers.push(loadJson(join(cwd, ".march", "config")));

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
    model: "deepseek-chat",
    provider: "deepseek",
    skills: [],
    pins: [],
  };

  for (const layer of layers) {
    if (!layer) continue;
    if (layer.model != null) result.model = layer.model;
    if (layer.provider) result.provider = layer.provider;
    if (Array.isArray(layer.skills)) {
      for (const s of layer.skills) {
        if (!result.skills.includes(s)) result.skills.push(s);
      }
    }
    if (Array.isArray(layer.pins)) {
      for (const p of layer.pins) {
        if (!result.pins.includes(p)) result.pins.push(p);
      }
    }
  }

  return result;
}
