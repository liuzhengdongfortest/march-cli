import { requestOfficeDaemon } from "./http.mjs";
import { ensureOfficeDaemon } from "./lifecycle.mjs";

export async function callOfficeDaemon({ stateRoot, method, params = {}, timeoutMs = 30000 }) {
  const state = await ensureOfficeDaemon({ stateRoot });
  const response = await requestOfficeDaemon(state.url, "/rpc", { method, params, timeoutMs }, { timeoutMs: timeoutMs + 1000 });
  return response.result;
}
