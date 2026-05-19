import { createProcessRuntimeIpcPeer } from "./ipc/process-ipc-transport.mjs";
import { createRunnerIpcTarget } from "./runner-ipc-target.mjs";
import { createIsolatedRunner } from "./runner-process-factory.mjs";

const peer = createProcessRuntimeIpcPeer({
  target: createRunnerIpcTarget({
    createRunnerImpl: (options) => createIsolatedRunner(options, { peer }),
  }),
});

process.once("disconnect", () => peer.dispose());
