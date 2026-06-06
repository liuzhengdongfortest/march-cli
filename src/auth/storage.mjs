import { execSync, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { AuthStorage } from "@earendil-works/pi-coding-agent";

const CONFIG_ONLY_MARKER = Symbol.for("march.configOnlyAuthStorage");
const ENV_REFERENCE_PATTERN = /(^|[^$])\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)/;

export function getMarchAuthPath(homeDir = homedir()) {
  return resolve(homeDir, ".march", "auth.json");
}

export function createMarchAuthStorage({
  providers = {},
  homeDir = homedir(),
  authStorage = null,
} = {}) {
  const resolvedAuthStorage = createConfigOnlyAuthStorage(authStorage ?? AuthStorage.create(getMarchAuthPath(homeDir)));

  for (const [id, profile] of Object.entries(providers ?? {})) {
    if (!profile || typeof profile !== "object") continue;
    const type = profile.type ?? profile.provider;
    const providerKey = type === "openai-compatible" ? id : type;
    const profileKey = profile.auth?.method === "apiKey" ? profile.auth?.apiKey : null;
    if (providerKey && isLiteralSecret(profileKey)) resolvedAuthStorage.setRuntimeApiKey(providerKey, profileKey);
  }
  const hasStoredAuth = safeListAuthProviders(resolvedAuthStorage).some((provider) => resolvedAuthStorage.hasAuth?.(provider));
  const hasConfiguredProvider = Object.values(providers ?? {}).some((profile) => {
    if (!profile || typeof profile !== "object") return false;
    return isLiteralSecret(profile.auth?.apiKey);
  });
  return {
    authStorage: resolvedAuthStorage,
    authPath: getMarchAuthPath(homeDir),
    hasAuth: hasStoredAuth || hasConfiguredProvider,
    diagnostics: [],
  };
}

// March owns provider selection. Upstream AuthStorage treats environment variables
// as credentials, which makes ambient shell state change March's active provider.
// This wrapper keeps stored/OAuth/runtime credentials, but blocks env fallback.
export function createConfigOnlyAuthStorage(authStorage) {
  if (!authStorage || authStorage[CONFIG_ONLY_MARKER]) return authStorage;
  const wrapper = Object.create(authStorage);
  Object.defineProperty(wrapper, CONFIG_ONLY_MARKER, { value: true });

  wrapper.hasAuth = function hasAuth(provider) {
    if (resolveConfigSecret(this.runtimeOverrides?.get?.(provider))) return true;
    const cred = this.data?.[provider];
    if (!cred) return false;
    if (cred.type === "api_key") return isLiteralSecret(cred.key);
    if (cred.type === "oauth") return true;
    return true;
  };

  wrapper.getAuthStatus = function getAuthStatus(provider) {
    const cred = this.data?.[provider];
    if (cred) return { configured: true, source: "stored" };
    if (resolveConfigSecret(this.runtimeOverrides?.get?.(provider))) return { configured: false, source: "runtime", label: "March config" };
    return { configured: false };
  };

  wrapper.getApiKey = async function getApiKey(providerId, _options) {
    const runtimeKey = this.runtimeOverrides?.get?.(providerId);
    const resolvedRuntimeKey = resolveConfigSecret(runtimeKey);
    if (resolvedRuntimeKey) return resolvedRuntimeKey;

    const cred = this.data?.[providerId];
    if (cred?.type === "api_key") return resolveConfigSecret(cred.key);
    if (cred?.type === "oauth") return getOAuthApiKeyWithoutEnvFallback(this, providerId, cred);
    return undefined;
  };

  return wrapper;
}

export function isLiteralSecret(value) {
  return typeof value === "string" && value.trim().length > 0 && !hasEnvReference(value);
}

function resolveConfigSecret(value) {
  if (!isLiteralSecret(value)) return undefined;
  if (!value.startsWith("!")) return value;
  return executeSecretCommand(value.slice(1));
}

function executeSecretCommand(command) {
  try {
    if (process.platform !== "win32") {
      return execSync(command, {
        encoding: "utf8",
        timeout: 10000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || undefined;
    }
    const shell = process.env.ComSpec || "cmd.exe";
    const result = spawnSync(shell, ["/d", "/s", "/c", command], {
      encoding: "utf8",
      timeout: 10000,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    if (result.status !== 0 || result.error) return undefined;
    return (result.stdout ?? "").trim() || undefined;
  } catch {
    return undefined;
  }
}

export function hasEnvReference(value) {
  return typeof value === "string" && ENV_REFERENCE_PATTERN.test(value);
}

function safeListAuthProviders(authStorage) {
  try {
    const providers = authStorage.list?.();
    return Array.isArray(providers) ? providers : [];
  } catch {
    return [];
  }
}

async function getOAuthApiKeyWithoutEnvFallback(authStorage, providerId, cred) {
  if (Date.now() >= cred.expires) {
    try {
      const refreshed = await authStorage.refreshOAuthTokenWithLock?.(providerId);
      if (refreshed) return refreshed.apiKey;
    } catch (error) {
      authStorage.recordError?.(error);
      authStorage.reload?.();
      const updatedCred = authStorage.data?.[providerId];
      if (updatedCred?.type === "oauth" && Date.now() < updatedCred.expires) {
        return authStorage.getOAuthProviders?.().find((provider) => provider.id === providerId)?.getApiKey?.(updatedCred);
      }
    }
    return undefined;
  }
  return authStorage.getOAuthProviders?.().find((provider) => provider.id === providerId)?.getApiKey?.(cred);
}
