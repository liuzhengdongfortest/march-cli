import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { loadOrCreateProjectId } from "./project-id.mjs";

const REGISTRY_VERSION = 1;

export function workspaceRegistryPath(stateRoot) {
  return join(stateRoot, "workspaces", "projects.json");
}

export function loadProjectRegistry({ stateRoot }) {
  const path = workspaceRegistryPath(stateRoot);
  if (!existsSync(path)) return { version: REGISTRY_VERSION, projects: [] };
  return normalizeRegistry(JSON.parse(readFileSync(path, "utf8")));
}

export function saveProjectRegistry({ stateRoot, registry }) {
  const path = workspaceRegistryPath(stateRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalizeRegistry(registry), null, 2)}\n`, "utf8");
}

export function registerProject({ stateRoot, rootPath, now = new Date() }) {
  const normalizedRoot = resolve(rootPath);
  const projectMarchDir = resolve(normalizedRoot, ".march");
  const projectId = loadOrCreateProjectId(projectMarchDir);
  const registry = loadProjectRegistry({ stateRoot });
  const project = normalizeProject({
    projectId,
    rootPath: normalizedRoot,
    displayName: basename(normalizedRoot) || normalizedRoot,
    lastOpenedAt: now.toISOString(),
  });
  const index = registry.projects.findIndex((entry) => entry.projectId === projectId || samePath(entry.rootPath, normalizedRoot));
  if (index >= 0) registry.projects[index] = { ...registry.projects[index], ...project };
  else registry.projects.push(project);
  registry.projects.sort(compareProjectsByLastOpened);
  saveProjectRegistry({ stateRoot, registry });
  return project;
}

export function listRegisteredProjects({ stateRoot }) {
  return loadProjectRegistry({ stateRoot }).projects.slice().sort(compareProjectsByLastOpened);
}

export function findRegisteredProject({ stateRoot, projectId }) {
  return listRegisteredProjects({ stateRoot }).find((project) => project.projectId === projectId) ?? null;
}

function normalizeRegistry(value) {
  return {
    version: Number(value?.version) || REGISTRY_VERSION,
    projects: Array.isArray(value?.projects) ? value.projects.map(normalizeProject).filter(Boolean) : [],
  };
}

function normalizeProject(value) {
  if (!value?.projectId || !value?.rootPath) return null;
  const rootPath = resolve(String(value.rootPath));
  return {
    projectId: String(value.projectId),
    rootPath,
    displayName: String(value.displayName || basename(rootPath) || rootPath),
    lastOpenedAt: String(value.lastOpenedAt || ""),
  };
}

function compareProjectsByLastOpened(a, b) {
  return String(b.lastOpenedAt || "").localeCompare(String(a.lastOpenedAt || ""));
}

function samePath(a, b) {
  return resolve(String(a)).toLowerCase() === resolve(String(b)).toLowerCase();
}
