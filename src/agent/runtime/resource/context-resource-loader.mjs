import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

export const MARCH_PI_RESOURCE_LOADER_OPTIONS = Object.freeze({
  noContextFiles: true,
});

export async function createMarchPiResourceLoader({ cwd, agentDir, settingsManager, extraOptions = {} }) {
  const resourceLoader = new DefaultResourceLoader({
    ...MARCH_PI_RESOURCE_LOADER_OPTIONS,
    ...extraOptions,
    cwd,
    agentDir,
    settingsManager,
  });
  await resourceLoader.reload();
  return resourceLoader;
}
