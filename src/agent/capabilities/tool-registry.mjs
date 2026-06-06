import { AVATAR_TOOL_CAPABILITY_PROVIDERS } from "./tool-providers/avatar-tools.mjs";
import { CORE_TOOL_CAPABILITY_PROVIDERS } from "./tool-providers/core-tools.mjs";
import { EXTERNAL_TOOL_CAPABILITY_PROVIDERS } from "./tool-providers/external-tools.mjs";

// Capability providers are the only place where tool families attach to a session boundary.
// Keep Agent Runtime Core out of individual provider wiring decisions.
const TOOL_CAPABILITY_PROVIDERS = [
  ...CORE_TOOL_CAPABILITY_PROVIDERS,
  ...EXTERNAL_TOOL_CAPABILITY_PROVIDERS,
  ...AVATAR_TOOL_CAPABILITY_PROVIDERS,
];

export function createToolsFromCapabilities(boundary) {
  const allowed = boundary.core.allowedToolNames ? new Set(boundary.core.allowedToolNames) : null;
  return TOOL_CAPABILITY_PROVIDERS
    .filter((candidate) => isProviderAllowed(candidate, allowed))
    .flatMap((candidate) => candidate.createTools(boundary))
    .filter((tool) => !allowed || allowed.has(tool.name));
}

function isProviderAllowed(candidate, allowed) {
  if (!allowed || !candidate.toolNames) return true;
  return candidate.toolNames.some((name) => allowed.has(name));
}
