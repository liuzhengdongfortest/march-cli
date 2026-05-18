import { strict as assert } from "node:assert";

export async function runNetworkEnvironmentSmoke() {
  console.log("--- smoke: network environment ---");
  const { resolveProxySettings } = await import("../src/network/environment.mjs");

  const direct = resolveProxySettings({ proxy: "direct", noProxy: ["localhost", "*.corp.local"] }, { env: {}, platform: "linux" });
  assert.deepEqual(direct, { mode: "direct", httpProxy: null, httpsProxy: null, noProxy: "localhost,*.corp.local" });

  const configured = resolveProxySettings({ proxy: "127.0.0.1:7890" }, { env: { NO_PROXY: "localhost" }, platform: "linux" });
  assert.deepEqual(configured, {
    mode: "config",
    httpProxy: "http://127.0.0.1:7890",
    httpsProxy: "http://127.0.0.1:7890",
    noProxy: "localhost",
  });

  const envProxy = resolveProxySettings({ proxy: "system" }, { env: { HTTPS_PROXY: "http://proxy.example:8080" }, platform: "linux" });
  assert.deepEqual(envProxy, {
    mode: "env",
    httpProxy: null,
    httpsProxy: "http://proxy.example:8080",
    noProxy: null,
  });

  console.log("  PASS");
}
