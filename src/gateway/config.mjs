import { resolve } from "node:path";

export function normalizeGatewayConfig(config = {}, { cwd = process.cwd() } = {}) {
  const raw = config.gateway && typeof config.gateway === "object" && !Array.isArray(config.gateway)
    ? config.gateway
    : {};
  const diagnostics = [];
  const workspaces = normalizeWorkspaces(raw.workspaces, { cwd, diagnostics });
  const defaultWorkspace = raw.defaultWorkspace ?? raw.default_workspace ?? null;
  const defaultWorkspaceAlias = resolveDefaultWorkspace(defaultWorkspace, { cwd, workspaces, diagnostics });

  return {
    enabled: raw.enabled === true,
    defaultWorkspace: defaultWorkspaceAlias,
    workspaces,
    platforms: raw.platforms && typeof raw.platforms === "object" && !Array.isArray(raw.platforms) ? { ...raw.platforms } : {},
    diagnostics,
  };
}

export function resolveGatewayWorkspace(gatewayConfig, alias = null) {
  const workspaceAlias = alias ?? gatewayConfig?.defaultWorkspace ?? null;
  if (!workspaceAlias) return null;
  return gatewayConfig?.workspaces?.[workspaceAlias] ?? null;
}

function normalizeWorkspaces(rawWorkspaces, { cwd, diagnostics }) {
  const workspaces = {};
  if (!rawWorkspaces || typeof rawWorkspaces !== "object" || Array.isArray(rawWorkspaces)) return workspaces;
  for (const [alias, value] of Object.entries(rawWorkspaces)) {
    const cleanAlias = normalizeAlias(alias);
    if (!cleanAlias) {
      diagnostics.push({ type: "warning", message: `Ignored gateway workspace with invalid alias: ${alias}` });
      continue;
    }
    const root = typeof value === "string" ? value : value?.root;
    if (typeof root !== "string" || root.trim() === "") {
      diagnostics.push({ type: "warning", message: `Ignored gateway workspace without root: ${alias}` });
      continue;
    }
    workspaces[cleanAlias] = { alias: cleanAlias, root: resolve(cwd, root) };
  }
  return workspaces;
}

function resolveDefaultWorkspace(defaultWorkspace, { cwd, workspaces, diagnostics }) {
  if (typeof defaultWorkspace !== "string" || defaultWorkspace.trim() === "") return null;
  const value = defaultWorkspace.trim();
  const alias = normalizeAlias(value);
  if (alias && workspaces[alias]) return alias;

  // Explicit default paths are accepted, but future /workspace set remains alias-only.
  const defaultAlias = "default";
  workspaces[defaultAlias] = { alias: defaultAlias, root: resolve(cwd, value) };
  diagnostics.push({ type: "info", message: "Gateway defaultWorkspace used an explicit path; registered it as workspace alias 'default'." });
  return defaultAlias;
}

function normalizeAlias(alias) {
  const value = String(alias ?? "").trim();
  return /^[a-zA-Z0-9_-]+$/.test(value) ? value : null;
}
