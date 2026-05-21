import { createGatewayMessageHandler } from "./handler.mjs";
import { GatewaySessionStore } from "./session-store.mjs";

export async function runGatewayDaemon({
  platform,
  platformRegistry,
  gatewayConfig,
  getRunner,
  currentProject = "",
  signal,
  logger = console,
} = {}) {
  if (!platform) throw new Error("Gateway daemon requires a platform id");
  if (!platformRegistry) throw new Error("Gateway daemon requires a platform registry");
  if (typeof getRunner !== "function") throw new Error("Gateway daemon requires a runner factory");

  const platformConfig = gatewayConfig?.platforms?.[platform] ?? {};
  const adapter = platformRegistry.create(platform, { config: platformConfig });
  const sessionStore = new GatewaySessionStore({ gatewayConfig });
  const handleMessage = createGatewayMessageHandler({ sessionStore, getRunner, currentProject });

  logger.info?.(`[gateway] starting ${platform}`);
  await adapter.start({ handleMessage, signal });
}
