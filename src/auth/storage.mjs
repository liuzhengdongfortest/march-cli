import { homedir } from "node:os";
import { resolve } from "node:path";
import { AuthStorage } from "@earendil-works/pi-coding-agent";

export function getMarchAuthPath(homeDir = homedir()) {
  return resolve(homeDir, ".march", "auth.json");
}

export function createMarchAuthStorage({
  providers = {},
  homeDir = homedir(),
  authStorage = null,
} = {}) {
  const resolvedAuthStorage = authStorage ?? AuthStorage.create(getMarchAuthPath(homeDir));

  for (const profile of Object.values(providers ?? {})) {
    if (!profile || typeof profile !== "object") continue;
    const type = profile.type ?? profile.provider;
    const profileKey = profile.auth?.method === "apiKey" ? profile.auth?.apiKey : null;
    if (type && profileKey) resolvedAuthStorage.setRuntimeApiKey(type, profileKey);
  }
  const hasStoredAuth = Boolean(resolvedAuthStorage.list?.().length);
  const hasConfiguredProvider = Object.values(providers ?? {}).some((profile) => {
    if (!profile || typeof profile !== "object") return false;
    return Boolean(profile.auth?.apiKey);
  });
  return {
    authStorage: resolvedAuthStorage,
    authPath: getMarchAuthPath(homeDir),
    hasAuth: hasStoredAuth || hasConfiguredProvider,
    diagnostics: [],
  };
}
