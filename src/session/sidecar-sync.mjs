import { syncMarchSessionState } from "./state/march-session-sync.mjs";

export function syncPiSessionSidecar(options) {
  return syncMarchSessionState(options);
}
