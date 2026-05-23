import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createProcessRuntimeIpcPeer } from "./ipc/process-ipc-transport.mjs";
import { createRemoteRunnerClient } from "./remote-runner-client.mjs";
import { createRuntimeUiEventTarget } from "./ui-event-bridge.mjs";

const DEFAULT_ENTRY = new URL("./runner-process-entry.mjs", import.meta.url);

export async function createRunnerProcessClient({
  runnerOptions,
  ui,
  onModelPayload = null,
  entry = fileURLToPath(DEFAULT_ENTRY),
  forkImpl = fork,
  timeoutMs = 0,
} = {}) {
  let active = await startRuntime();
  let disposed = false;
  const localProps = new Map();

  const runner = new Proxy({}, {
    get(_target, prop) {
      if (prop === "restartRuntime") return restartRuntime;
      if (prop === "dispose") return dispose;
      if (localProps.has(prop)) return localProps.get(prop);
      const value = active.runner[prop];
      return typeof value === "function" ? value.bind(active.runner) : value;
    },
    set(_target, prop, value) {
      localProps.set(prop, value);
      return true;
    },
    has(_target, prop) {
      return prop === "restartRuntime" || prop === "dispose" || localProps.has(prop) || prop in active.runner;
    },
  });

  return { runner, get child() { return active.child; }, dispose };

  async function startRuntime() {
    const child = forkImpl(entry, [], {
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    const peer = createProcessRuntimeIpcPeer({
      processLike: child,
      target: {
        ...createRuntimeUiEventTarget(ui),
        modelPayload: (event) => onModelPayload?.(event),
      },
      timeoutMs,
    });
    const remoteRunner = createRemoteRunnerClient(peer);
    try {
      await remoteRunner.init(runnerOptions);
    } catch (error) {
      peer.dispose();
      child.kill?.();
      throw error;
    }
    return {
      runner: remoteRunner,
      child,
      async dispose() {
        try {
          await remoteRunner.dispose();
        } finally {
          child.kill?.();
        }
      },
    };
  }

  async function restartRuntime({ restoreSession = true } = {}) {
    if (disposed) throw new Error("runtime runner is already disposed");
    const previousState = await refreshRunnerState(active.runner);
    const previousSessionFile = previousState?.sessionStats?.sessionFile ?? previousState?.sessionStats?.sessionPath ?? null;
    const previousActive = active;
    await previousActive.dispose();
    active = await startRuntime();

    // Rebind the same persisted pi session after the fresh child imports updated source.
    if (restoreSession && previousSessionFile && active.runner.canSwitchPiSession?.()) {
      await active.runner.switchPiSession(previousSessionFile, previousState?.engine ?? null);
    }
    return await refreshRunnerState(active.runner);
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    await active.dispose();
  }
}

async function refreshRunnerState(runner) {
  if (typeof runner.refreshState === "function") return await runner.refreshState();
  return runner.runtimeState ?? null;
}
