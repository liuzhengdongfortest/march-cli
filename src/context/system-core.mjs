import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPT_DIR = join(dirname(fileURLToPath(import.meta.url)), "system-core", "prompts");
const DEFAULT_PROMPT_KEY = "default";

export function buildSystemCore({ modelId } = {}) {
  const prompt = loadSystemCorePrompt({ modelId });
  return `[system_core]\n${prompt.content}`;
}

export function resolveSystemCorePromptKey({ modelId = "" } = {}) {
  const key = sanitizeModelId(modelId);
  if (key && existsSync(promptPath(key))) return key;
  return DEFAULT_PROMPT_KEY;
}

function loadSystemCorePrompt({ modelId } = {}) {
  const key = resolveSystemCorePromptKey({ modelId });
  return {
    key,
    content: readFileSync(promptPath(key), "utf8").trim(),
  };
}

function promptPath(key) {
  return join(PROMPT_DIR, `${key}.md`);
}

function sanitizeModelId(modelId) {
  return String(modelId || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}
