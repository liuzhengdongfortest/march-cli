import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function installedOfficeAddinPath(stateRoot) {
  return resolve(stateRoot, "office-addin");
}

export function syncOfficeAddinInstall(stateRoot) {
  const target = installedOfficeAddinPath(stateRoot);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(sourceAddinPath(), target, { recursive: true });
  return target;
}

function sourceAddinPath() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "addin");
}
