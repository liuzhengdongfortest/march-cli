import { createToolsFromCapabilities } from "./capabilities/tool-registry.mjs";
import { createRunnerSessionBoundary } from "./session/session-boundary.mjs";

export function createMarchCustomTools(options = {}) {
  const boundary = createRunnerSessionBoundary(options);
  return createToolsFromCapabilities(boundary);
}
