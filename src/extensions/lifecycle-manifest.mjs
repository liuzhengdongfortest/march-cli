import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function discoverProjectLifecycleHookManifestPaths(cwd) {
  const extensionsDir = resolve(cwd, ".march", "extensions");
  if (!existsSync(extensionsDir)) return [];

  const entries = readdirSync(extensionsDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  const paths = [];
  for (const entry of entries) {
    const entryPath = join(extensionsDir, entry.name);
    if (entry.isFile() && entry.name.endsWith(".march-hooks.json")) {
      paths.push(entryPath);
      continue;
    }
    if (entry.isDirectory()) {
      const manifestPath = join(entryPath, "march-hooks.json");
      if (existsSync(manifestPath)) paths.push(manifestPath);
    }
  }
  return paths;
}

export function loadProjectLifecycleHookManifests(cwd) {
  return loadLifecycleHookManifests(discoverProjectLifecycleHookManifestPaths(cwd));
}

export function loadLifecycleHookManifests(paths) {
  const hooks = [];
  const diagnostics = [];
  for (const path of paths) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      for (const hook of normalizeManifestHooks(parsed, path)) hooks.push(hook);
    } catch (err) {
      diagnostics.push({
        type: "warning",
        message: `Failed to load March lifecycle hook manifest: ${err.message}`,
        path,
      });
    }
  }
  return { hooks, diagnostics };
}

function normalizeManifestHooks(parsed, path) {
  const rawHooks = Array.isArray(parsed) ? parsed : parsed?.hooks;
  if (!Array.isArray(rawHooks)) throw new Error("manifest must be an array or an object with hooks[]");
  return rawHooks.map((hook, index) => normalizeManifestHook(hook, path, index));
}

function normalizeManifestHook(hook, path, index) {
  if (!hook || typeof hook !== "object") throw new Error(`hook ${index + 1} must be an object`);
  if (!hook.id || typeof hook.id !== "string") throw new Error(`hook ${index + 1} requires string id`);
  if (!hook.kind || typeof hook.kind !== "string") throw new Error(`hook ${index + 1} requires string kind`);
  const effects = Array.isArray(hook.effects) ? hook.effects : [];
  if (!effects.every((effect) => typeof effect === "string")) {
    throw new Error(`hook ${hook.id} effects must be strings`);
  }
  return {
    id: hook.id,
    kind: hook.kind,
    effects,
    blocking: Boolean(hook.blocking),
    description: typeof hook.description === "string" ? hook.description : "",
    sourcePath: path,
  };
}
