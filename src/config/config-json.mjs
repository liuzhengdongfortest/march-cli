import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export function globalConfigJsonPath(homeDir = homedir()) {
  return join(homeDir, ".march", "config.json");
}

export function readConfigJson(path) {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function writeConfigJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function upsertProviderProfile({ path = globalConfigJsonPath(), id, type, auth }) {
  const config = readConfigJson(path);
  const providers = config.providers && typeof config.providers === "object" && !Array.isArray(config.providers)
    ? config.providers
    : {};
  providers[id] = {
    ...(providers[id] ?? {}),
    type,
    auth,
  };
  config.providers = providers;
  delete config.provider;
  delete config.model;
  writeConfigJson(path, config);
  return config;
}
