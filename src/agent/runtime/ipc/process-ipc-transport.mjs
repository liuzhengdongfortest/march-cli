import { createRuntimeIpcPeer } from "./ipc-peer.mjs";

export function createProcessRuntimeIpcPeer({ processLike = process, target = {}, timeoutMs = 0 } = {}) {
  return createRuntimeIpcPeer({
    send: (message) => {
      if (typeof processLike.send !== "function") throw new Error("process IPC send is unavailable");
      processLike.send(message);
    },
    subscribe: (listener) => {
      processLike.on("message", listener);
      return () => processLike.off("message", listener);
    },
    target,
    timeoutMs,
  });
}
