import { join } from "node:path";
import { HistoryStore } from "./store.mjs";

export function createRunnerHistoryStore({ stateRoot, cwd } = {}) {
  if (!stateRoot) return null;
  return new HistoryStore({ root: join(stateRoot, "history"), cwd });
}

export function appendRunnerTurnHistory({ store, turn, sessionStats, modelId, provider }) {
  return store?.appendTurn({ turn, sessionStats, runtime: { modelId, provider } });
}
