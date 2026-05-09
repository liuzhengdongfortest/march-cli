import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { loadConfig } from "./loader.mjs";

const WRITABLE_KEYS = new Set(["model", "provider"]);
const SCOPES = new Set(["global", "project"]);

export function parseSettingsCommand(input) {
  if (input !== "/settings" && !input.startsWith("/settings ")) return { type: "none" };
  const arg = input.slice("/settings".length).trim();
  if (!arg) return { type: "view" };

  const setMatch = arg.match(/^set\s+(global|project)\s+(model|provider)\s+(.+)$/);
  if (setMatch) {
    return { type: "set", scope: setMatch[1], key: setMatch[2], value: setMatch[3].trim() };
  }

  const unsetMatch = arg.match(/^unset\s+(global|project)\s+(model|provider)$/);
  if (unsetMatch) {
    return { type: "unset", scope: unsetMatch[1], key: unsetMatch[2] };
  }

  return { type: "error", message: "Usage: /settings [set <global|project> <model|provider> <value> | unset <global|project> <model|provider>]" };
}

export function handleSettingsCommand(command, { cwd = process.cwd(), homeDir = homedir() } = {}) {
  if (command.type === "view") return formatSettingsView({ cwd, homeDir });
  if (command.type === "error") return [`Error: ${command.message}`];
  if (!SCOPES.has(command.scope) || !WRITABLE_KEYS.has(command.key)) {
    return ["Error: unsupported settings scope or key"];
  }

  const path = settingsPathForScope(command.scope, { cwd, homeDir });
  const data = readSettingsFile(path);
  if (command.type === "set") {
    data[command.key] = command.value;
  } else if (command.type === "unset") {
    delete data[command.key];
  }
  writeSettingsFile(path, data);
  return [
    `Settings ${command.type === "set" ? "updated" : "unset"}: ${command.scope}.${command.key}`,
    "Changes apply on next March startup; current session runtime is unchanged.",
    ...formatSettingsView({ cwd, homeDir }),
  ];
}

export function formatSettingsView({ cwd = process.cwd(), homeDir = homedir() } = {}) {
  const globalPath = settingsPathForScope("global", { cwd, homeDir });
  const projectPath = settingsPathForScope("project", { cwd, homeDir });
  const globalSettings = readSettingsFile(globalPath);
  const projectSettings = readSettingsFile(projectPath);
  const merged = loadConfig(cwd, { homeDir });
  return [
    "Settings:",
    `  merged.provider: ${merged.provider}`,
    `  merged.model: ${merged.model}`,
    `  global: ${globalPath}`,
    ...formatScopeLines(globalSettings),
    `  project: ${projectPath}`,
    ...formatScopeLines(projectSettings),
    "Commands:",
    "  /settings set project model <id>",
    "  /settings set project provider <name>",
    "  /settings unset project model",
    "  /settings set global model <id>",
  ];
}

function settingsPathForScope(scope, { cwd, homeDir }) {
  return scope === "global"
    ? join(homeDir, ".march", "config")
    : join(cwd, ".march", "config");
}

function readSettingsFile(path) {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeSettingsFile(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function formatScopeLines(settings) {
  const keys = Object.keys(settings).sort();
  if (keys.length === 0) return ["    (empty)"];
  return keys.map((key) => `    ${key}: ${formatSettingValue(settings[key])}`);
}

function formatSettingValue(value) {
  return Array.isArray(value) ? value.join(", ") : String(value);
}
