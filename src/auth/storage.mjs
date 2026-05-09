import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { AuthStorage } from "@mariozechner/pi-coding-agent";

export function providerApiKeyEnv(provider) {
  const envMap = {
    deepseek: "DEEPSEEK_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
  };
  return envMap[provider] ?? `${String(provider).toUpperCase()}_API_KEY`;
}

export function createMarchAuthStorage({
  provider = "deepseek",
  cwd = process.cwd(),
  homeDir = homedir(),
  env = process.env,
  authStorage = AuthStorage.create(),
  loadEnv = true,
} = {}) {
  const diagnostics = [];
  if (loadEnv) {
    diagnostics.push(...loadMarchEnvFiles({ cwd, homeDir, env }));
  }

  const apiKeyEnv = providerApiKeyEnv(provider);
  const apiKey = env[apiKeyEnv];
  if (apiKey) {
    authStorage.setRuntimeApiKey(provider, apiKey);
  }
  return {
    authStorage,
    apiKeyEnv,
    hasApiKey: Boolean(apiKey),
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
