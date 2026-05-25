import {
  createAgentSessionFromServices,
  createAgentSessionServices,
} from "@earendil-works/pi-coding-agent";
import { MARCH_PI_RESOURCE_LOADER_OPTIONS } from "./resource/context-resource-loader.mjs";

export function createMarchRuntimeFactory({
  agentDir,
  authStorage,
  settingsManager,
  modelRegistry,
  resolveSessionOptions,
  resourceLoaderOptions = {},
  createServices = createAgentSessionServices,
  createFromServices = createAgentSessionFromServices,
}) {
  if (typeof resolveSessionOptions !== "function") {
    throw new Error("resolveSessionOptions is required");
  }

  return async ({ cwd, sessionManager, sessionStartEvent }) => {
    const services = await createServices({
      cwd,
      agentDir,
      authStorage,
      settingsManager,
      modelRegistry,
      resourceLoaderOptions: {
        ...MARCH_PI_RESOURCE_LOADER_OPTIONS,
        ...resourceLoaderOptions,
      },
    });
    const sessionOptions = await resolveSessionOptions({ cwd, services });
    const result = await createFromServices({
      services,
      sessionManager,
      sessionStartEvent,
      ...sessionOptions,
    });
    return {
      ...result,
      services,
      diagnostics: services.diagnostics,
    };
  };
}
