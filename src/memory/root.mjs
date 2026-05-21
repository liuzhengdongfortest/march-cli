import { resolve } from "node:path";

export function resolveMemoryRoot(configured, stateRoot) {
  if (configured) return resolve(String(configured));
  if (process.env.MARCH_MEMORY_ROOT) return resolve(process.env.MARCH_MEMORY_ROOT);
  return resolve(stateRoot, "March Memories");
}
