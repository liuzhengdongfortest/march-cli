import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function sourceBrowserExtensionPath() {
  const path = resolve(dirname(fileURLToPath(import.meta.url)), "extension");
  if (!existsSync(path)) throw new Error(`Browser extension not found: ${path}`);
  return path;
}

export function installedBrowserExtensionPath(stateRoot) {
  return resolve(stateRoot, "browser-extension");
}

export function syncBrowserExtensionInstall(stateRoot) {
  const source = sourceBrowserExtensionPath();
  const target = installedBrowserExtensionPath(stateRoot);
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
  return target;
}
