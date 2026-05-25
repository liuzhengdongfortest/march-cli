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

export function removeProviderProfile({ path = globalConfigJsonPath(), id }) {
  const config = readConfigJson(path);
  const providers = config.providers && typeof config.providers === "object" && !Array.isArray(config.providers)
    ? config.providers
    : {};
  const hadProviderProfile = Object.prototype.hasOwnProperty.call(providers, id);
  const wasSelectedProvider = config.provider === id;
  if (hadProviderProfile) delete providers[id];
  if (Object.keys(providers).length) config.providers = providers;
  else delete config.providers;
  if (wasSelectedProvider) {
    delete config.provider;
    delete config.model;
    delete config.serviceTier;
  }
  if (!hadProviderProfile && !wasSelectedProvider) return false;
  writeConfigJson(path, config);
  return true;
}

export function upsertSharedProviderProfile({ path = globalConfigJsonPath(), id, provider }) {
  const config = readConfigJson(path);
  const providers = config.providers && typeof config.providers === "object" && !Array.isArray(config.providers)
    ? config.providers
    : {};
  providers[id] = provider;
  config.providers = providers;
  writeConfigJson(path, config);
  return config;
}

export function upsertModelSelection({ path = globalConfigJsonPath(), provider, model, serviceTier }) {
  const config = readConfigJson(path);
  config.provider = provider;
  config.model = model;
  if (serviceTier) {
    config.serviceTier = serviceTier;
  } else {
    delete config.serviceTier;
  }
  writeConfigJson(path, config);
  return config;
}

export function upsertWebSearchProvider({ path = globalConfigJsonPath(), id, apiKey }) {
  const config = readConfigJson(path);
  const webSearch = config.webSearch && typeof config.webSearch === "object" && !Array.isArray(config.webSearch)
    ? config.webSearch
    : {};
  const providers = webSearch.providers && typeof webSearch.providers === "object" && !Array.isArray(webSearch.providers)
    ? webSearch.providers
    : {};
  providers[id] = {
    ...(providers[id] ?? {}),
    apiKey,
  };
  config.webSearch = {
    ...webSearch,
    provider: id,
    providers,
  };
  writeConfigJson(path, config);
  return config;
}


export function upsertRemoteMemorySource({ path = globalConfigJsonPath(), name, url, token = null }) {
  const config = readConfigJson(path);
  const remoteMemories = Array.isArray(config.remoteMemories) ? [...config.remoteMemories] : [];
  const next = { name, url };
  if (token) next.token = token;
  const index = remoteMemories.findIndex((source) => source?.name === name);
  if (index >= 0) remoteMemories[index] = { ...remoteMemories[index], ...next };
  else remoteMemories.push(next);
  config.remoteMemories = remoteMemories;
  writeConfigJson(path, config);
  return config;
}

export function removeRemoteMemorySource({ path = globalConfigJsonPath(), name }) {
  const config = readConfigJson(path);
  const remoteMemories = Array.isArray(config.remoteMemories) ? config.remoteMemories : [];
  const next = remoteMemories.filter((source) => source?.name !== name);
  if (next.length === remoteMemories.length) return false;
  config.remoteMemories = next;
  writeConfigJson(path, config);
  return true;
}
