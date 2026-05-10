import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { AuthStorage } from "@mariozechner/pi-coding-agent";

export function getMarchAuthPath(homeDir = homedir()) {
  return resolve(homeDir, ".march", "auth.json");
}

export function providerApiKeyEnv(provider) {
  const envMap = {
    deepseek: "DEEPSEEK_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
  };
  const normalized = String(provider).toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return envMap[provider] ?? `${normalized}_API_KEY`;
}

export function createMarchAuthStorage({
  provider = "deepseek",
  cwd = process.cwd(),
  homeDir = homedir(),
  env = process.env,
  authStorage = null,
  loadEnv = true,
} = {}) {
  const resolvedAuthStorage = authStorage ?? AuthStorage.create(getMarchAuthPath(homeDir));
  const diagnostics = [];
  if (loadEnv) {
    diagnostics.push(...loadMarchEnvFiles({ cwd, homeDir, env }));
  }

  const apiKeyEnv = providerApiKeyEnv(provider);
  const apiKey = env[apiKeyEnv];
  if (apiKey) {
    resolvedAuthStorage.setRuntimeApiKey(provider, apiKey);
  }
  const hasStoredAuth = Boolean(resolvedAuthStorage.hasAuth?.(provider));
  return {
    authStorage: resolvedAuthStorage,
    authPath: getMarchAuthPath(homeDir),
    apiKeyEnv,
    hasApiKey: Boolean(apiKey),
    hasAuth: Boolean(apiKey) || hasStoredAuth,
    diagnostics,
  };
}

export function loadMarchEnvFiles({ cwd = process.cwd(), homeDir = homedir(), env = process.env } = {}) {
  return [
    loadDotEnvFile(resolve(cwd, ".env"), { env }),
    loadDotEnvFile(resolve(homeDir, ".march", ".env"), { env }),
  ].filter(Boolean);
}

export function loadDotEnvFile(filePath, { env = process.env } = {}) {
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      const normalizedKey = key.toUpperCase();
      if (!env[key] && !env[normalizedKey]) {
        env[normalizedKey] = value;
      }
    }
    return { type: "info", message: `Loaded env file: ${filePath}`, path: filePath };
  } catch (err) {
    return { type: "warning", message: `Failed to load env file: ${err.message}`, path: filePath };
  }
}
