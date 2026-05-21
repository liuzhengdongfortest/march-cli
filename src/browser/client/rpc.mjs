import { ensureBrowserDaemon } from "./lifecycle.mjs";
import { requestBrowserDaemon } from "./http.mjs";

export async function callBrowserDaemon({ stateRoot, method, params = {}, timeoutMs = 30000 }) {
  const state = await ensureBrowserDaemon({ stateRoot });
  const response = await requestBrowserDaemon(state.url, "/rpc", { method, params, timeoutMs }, { timeoutMs: timeoutMs + 1000 });
  return response.result;
}
