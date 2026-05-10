import { createShellRuntime } from "./runtime.mjs";
import { createNodePtyAdapterFactory } from "./node-pty-adapter.mjs";

export function createCliShellRuntime({ cwd = process.cwd(), env = process.env } = {}) {
  return createShellRuntime({
    createPty: createNodePtyAdapterFactory({
      defaultCwd: cwd,
      defaultEnv: env,
    }),
  });
}
