import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { ensureManagedNodeCommand, ensureManagedTypeScript, findManagedTypeScriptSdk, findManagedTypeScriptServer } from "./managed-node-server.mjs";
import { createLspServerDefinitions } from "./server-definitions.mjs";
import { resolveTypeScriptProjectRoot } from "./typescript-project-resolver.mjs";

const LSP_SERVERS = createLspServerDefinitions({ resolveTypeScriptProjectRoot, resolveTypeScriptSdk, resolveTypeScriptServer });

export async function resolveLspServer({ filePath, workspaceRoot, onEvent = null } = {}) {
  const result = await resolveLspServerStatus({ filePath, workspaceRoot, onEvent });
  return result.status === "available" ? result.server : null;
}

export async function resolveLspServerStatus({ filePath, workspaceRoot, onEvent = null } = {}) {
  const ext = extensionOf(filePath);
  const def = LSP_SERVERS.find((server) => matchesServer(server, filePath, ext));
  if (!def) return { status: "unsupported", extension: ext };

  const root = resolveServerRoot(def, { filePath, workspaceRoot });
  const command = await resolveCommand(def, { root, workspaceRoot, onEvent });
  if (command?.error) return { status: "unavailable", id: def.id, root, reason: command.error };
  if (!command) return { status: "unavailable", id: def.id, root, reason: `missing ${def.command[0]}` };

  const managedTypeScript = await ensureTypeScriptFallback(def, { root, workspaceRoot, onEvent });
  if (managedTypeScript?.error) return { status: "unavailable", id: def.id, root, reason: managedTypeScript.error };

  const initialization = def.initialization?.({ root, workspaceRoot }) ?? {};
  if (initialization === null) {
    return { status: "unavailable", id: def.id, root, reason: def.missingInitialization ?? "missing SDK" };
  }
  return {
    status: "available",
    server: { id: def.id, command: command.command, args: def.args, root, initialization, managed: command.managed },
  };
}

export function listLspServerDefinitions() {
  return LSP_SERVERS.map(({ id, extensions, filenames, rootMarkers, command, args }) => ({ id, extensions, filenames, rootMarkers, command, args }));
}

function matchesServer(server, filePath, ext) {
  if (server.extensions.includes(ext)) return true;
  const name = basename(filePath).toLowerCase();
  return server.filenames?.includes(name) ?? false;
}

async function resolveCommand(def, { root, workspaceRoot, onEvent }) {
  const local = findCommand(def.command, { root, workspaceRoot });
  if (local) return { command: local, managed: false };
  if (!def.managedCommand) return null;
  onEvent?.({ status: "installing", id: def.id, root, reason: `installing ${def.managedCommand}` });
  try {
    const managed = await ensureManagedNodeCommand(def.managedCommand);
    return { command: managed.command, managed: true };
  } catch (err) {
    const reason = err.message;
    onEvent?.({ status: "failed", id: def.id, root, reason });
    return { error: reason };
  }
}

async function ensureTypeScriptFallback(def, { root, workspaceRoot, onEvent }) {
  if (!def.managedTypeScript || resolveTypeScriptServer({ root, workspaceRoot })) return null;
  onEvent?.({ status: "installing", id: def.id, root, reason: "installing typescript" });
  try {
    await ensureManagedTypeScript();
    return null;
  } catch (err) {
    const reason = err.message;
    onEvent?.({ status: "failed", id: def.id, root, reason });
    return { error: reason };
  }
}

function resolveServerRoot(def, { filePath, workspaceRoot }) {
  const projectRoot = def.projectRoot?.({ filePath, workspaceRoot });
  if (projectRoot) return projectRoot;
  return def.rootMarkers.length > 0
    ? findNearestRoot(dirname(filePath), workspaceRoot, def.rootMarkers) ?? workspaceRoot
    : workspaceRoot;
}

function findCommand(names, { root, workspaceRoot }) {
  for (const name of names) {
    const hit = findBin(name, { root, workspaceRoot });
    if (hit) return hit;
  }
  return null;
}

function findBin(name, { root, workspaceRoot }) {
  const names = platformCommandNames(name);
  for (const base of uniquePaths([root, workspaceRoot])) {
    for (const bin of names) {
      const candidate = join(base, "node_modules", ".bin", bin);
      if (existsSync(candidate)) return candidate;
    }
  }
  return findOnPath(names);
}

function platformCommandNames(name) {
  if (process.platform !== "win32") return [name];
  return name.includes("/") ? [name] : [`${name}.cmd`, `${name}.exe`, name];
}

function findOnPath(names) {
  const dirs = (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":").filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function resolveTypeScriptServer({ root, workspaceRoot }) {
  return resolveModuleFromRoots("typescript/lib/tsserver.js", { root, workspaceRoot }) ?? findManagedTypeScriptServer();
}

function resolveTypeScriptSdk({ root, workspaceRoot }) {
  const serverLibrary = resolveModuleFromRoots("typescript/lib/tsserverlibrary.js", { root, workspaceRoot });
  const tsserver = serverLibrary ?? resolveTypeScriptServer({ root, workspaceRoot });
  return tsserver ? dirname(tsserver) : findManagedTypeScriptSdk();
}

function resolveModuleFromRoots(id, { root, workspaceRoot }) {
  for (const base of uniquePaths([root, workspaceRoot])) {
    const hit = resolveModule(id, base);
    if (hit) return hit;
  }
  return null;
}

function resolveModule(id, base) {
  try {
    return createRequire(join(base, "package.json")).resolve(id);
  } catch {
    return null;
  }
}

function uniquePaths(paths) {
  return [...new Set(paths.map((path) => resolve(path)))];
}

function findNearestRoot(start, stop, markers) {
  let dir = resolve(start);
  const boundary = resolve(stop);
  for (;;) {
    for (const marker of markers) {
      if (existsSync(join(dir, marker))) return dir;
    }
    if (dir === boundary || dirname(dir) === dir) return null;
    dir = dirname(dir);
  }
}

function extensionOf(path) {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot === -1 ? "" : lower.slice(dot);
}
