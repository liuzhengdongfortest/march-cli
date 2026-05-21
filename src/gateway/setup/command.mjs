import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createInterface } from "node:readline";
import { readConfigJson, writeConfigJson } from "../../config/config-json.mjs";
import { selectWithKeyboard } from "../../cli/input/select-with-keyboard.mjs";

const TELEGRAM_PLATFORM = { id: "telegram", label: "Telegram", tokenEnv: "TELEGRAM_BOT_TOKEN" };

export async function runGatewaySetupCommand({
  cwd = process.cwd(),
  input = process.stdin,
  output = process.stdout,
  select = selectWithKeyboard,
  readSecret = readLine,
  readText = readLine,
} = {}) {
  output.write("Gateway setup\n\n");
  const platform = await select({
    input,
    output,
    message: "Choose gateway platform",
    items: [{ label: TELEGRAM_PLATFORM.label, value: TELEGRAM_PLATFORM }],
  });
  if (!platform) {
    output.write("Gateway setup cancelled.\n");
    return 1;
  }

  const token = String(await readSecret({ input, output, prompt: "Telegram bot token: " }) ?? "").trim();
  if (!token) {
    output.write("Telegram bot token is required.\n");
    return 1;
  }

  const userId = String(await readText({ input, output, prompt: "Allowed Telegram user id: " }) ?? "").trim();
  if (!userId) {
    output.write("Allowed Telegram user id is required.\n");
    return 1;
  }

  const workspaceAlias = normalizeAlias(String(await readText({ input, output, prompt: "Workspace alias [current]: " }) ?? "").trim() || "current");
  if (!workspaceAlias) {
    output.write("Workspace alias must contain only letters, numbers, _ or -.\n");
    return 1;
  }

  const configPath = projectGatewayConfigJsonPath(cwd);
  upsertGatewayProjectConfig({
    path: configPath,
    workspaceAlias,
    workspaceRoot: ".",
    platformId: platform.id,
    tokenEnv: platform.tokenEnv,
    allowedUsers: [userId],
  });
  const envPath = projectEnvPath(cwd);
  upsertEnvFile({ path: envPath, key: platform.tokenEnv, value: token });

  output.write("\nGateway configured.\n");
  output.write(`Config: ${relative(cwd, configPath) || configPath}\n`);
  output.write(`Secret env: ${relative(cwd, envPath) || envPath}\n`);
  output.write("\nRun:\n  march gateway run\n");
  return 0;
}

export function projectGatewayConfigJsonPath(cwd) {
  return join(cwd, ".march", "config.json");
}

export function projectEnvPath(cwd) {
  return join(cwd, ".env");
}

export function upsertGatewayProjectConfig({ path, workspaceAlias, workspaceRoot = ".", platformId = "telegram", tokenEnv = "TELEGRAM_BOT_TOKEN", allowedUsers = [] }) {
  const config = readConfigJson(path);
  const gateway = config.gateway && typeof config.gateway === "object" && !Array.isArray(config.gateway) ? config.gateway : {};
  const workspaces = gateway.workspaces && typeof gateway.workspaces === "object" && !Array.isArray(gateway.workspaces) ? gateway.workspaces : {};
  const platforms = gateway.platforms && typeof gateway.platforms === "object" && !Array.isArray(gateway.platforms) ? gateway.platforms : {};
  const platform = platforms[platformId] && typeof platforms[platformId] === "object" && !Array.isArray(platforms[platformId]) ? platforms[platformId] : {};

  config.gateway = {
    ...gateway,
    enabled: true,
    defaultWorkspace: workspaceAlias,
    workspaces: {
      ...workspaces,
      [workspaceAlias]: workspaceRoot,
    },
    platforms: {
      ...platforms,
      [platformId]: {
        ...platform,
        enabled: true,
        botTokenEnv: tokenEnv,
        allowedUsers: mergeUniqueStrings(platform.allowedUsers ?? platform.allowed_users, allowedUsers),
      },
    },
  };
  writeConfigJson(path, config);
  return config;
}

export function upsertEnvFile({ path, key, value }) {
  const lines = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  const nextLine = `${key}=${escapeEnvValue(value)}`;
  let replaced = false;
  const next = lines.map((line) => {
    const parsed = parseEnvLine(line);
    if (parsed?.key !== key) return line;
    replaced = true;
    return nextLine;
  });
  if (!replaced) {
    if (next.length && next[next.length - 1] !== "") next.push("");
    next.push(nextLine);
  }
  while (next.length > 1 && next[next.length - 1] === "" && next[next.length - 2] === "") next.pop();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${next.join("\n").replace(/\n*$/, "")}\n`, "utf8");
}

function normalizeAlias(value) {
  return /^[a-zA-Z0-9_-]+$/.test(value) ? value : null;
}

function mergeUniqueStrings(current, additions) {
  const values = Array.isArray(current) ? current : String(current ?? "").split(",");
  return [...new Set([...values, ...additions].map((value) => String(value).trim()).filter(Boolean))];
}

function parseEnvLine(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq < 1) return null;
  return { key: trimmed.slice(0, eq).trim() };
}

function escapeEnvValue(value) {
  const raw = String(value ?? "");
  return /^[A-Za-z0-9_./:@-]+$/.test(raw) ? raw : JSON.stringify(raw);
}

function readLine({ input = process.stdin, output = process.stdout, prompt }) {
  const rl = createInterface({ input, output });
  return new Promise((resolve) => rl.question(prompt, (answer) => {
    rl.close();
    resolve(answer);
  }));
}
