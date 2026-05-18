import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createProcessRuntimeIpcPeer } from "./ipc/process-ipc-transport.mjs";
import { createRemoteRunnerClient } from "./remote-runner-client.mjs";
import { createRuntimeUiEventTarget } from "./ui-event-bridge.mjs";

const DEFAULT_ENTRY = new URL("./runner-process-entry.mjs", import.meta.url);

export async function createRunnerProcessClient({
  runnerOptions,
  ui,
  entry = fileURLToPath(DEFAULT_ENTRY),
  forkImpl = fork,
  timeoutMs = 0,
} = {}) {
  const child = forkImpl(entry, [], {
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  const peer = createProcessRuntimeIpcPeer({
    processLike: child,
    target: createRuntimeUiEventTarget(ui),
    timeoutMs,
  });
  const runner = createRemoteRunnerClient(peer);
  try {
    await runner.init(runnerOptions);
  } catch (error) {
    peer.dispose();
    child.kill?.();
    throw error;
  }

  return {
    runner,
    child,
    async dispose() {
      try {
        await runner.dispose();
      } finally {
        child.kill?.();
      }
    },
  };
}
