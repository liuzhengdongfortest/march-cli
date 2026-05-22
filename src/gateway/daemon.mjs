import { createGatewayMessageHandler } from "./handler.mjs";
import { createGatewayMessageQueue } from "./runtime/queue.mjs";
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
  if (typeof adapter.send !== "function") throw new Error(`Gateway platform '${platform}' requires a send function`);
  if (typeof adapter.sendBinary !== "function") throw new Error(`Gateway platform '${platform}' requires a sendBinary function`);
  const sessionStore = new GatewaySessionStore({ gatewayConfig });
  const handleMessage = createGatewayMessageHandler({
    sessionStore,
    getRunner,
    currentProject,
    outputSinkForMessage: (message) => ({
      sendBinary: (binary) => adapter.sendBinary({ chatId: message.chatId, binary, replyToMessageId: message.messageId }),
    }),
  });
  const queue = createGatewayMessageQueue({
    handleMessage,
    logger,
    send: async (message, result) => {
      await adapter.send({ chatId: message.chatId, lines: result?.lines ?? [], replyToMessageId: message.messageId });
    },
  });

  logger.info?.(`[gateway] starting ${platform}`);
  await adapter.start({ handleMessage: (message) => queue.enqueue(message), signal });
}
