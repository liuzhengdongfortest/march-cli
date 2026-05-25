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

  const { createIsolatedRunner } = await import("../src/agent/runtime/runner-process-factory.mjs");
  const calls = [];
  const runner = await createIsolatedRunner({
    cwd: "D:/repo",
    provider: "deepseek",
    config: { network: { proxy: "http://proxy.example:8080", ca: "system" }, notifications: {} },
  }, createFakeRuntimeDeps(calls));
  assert.deepEqual(calls.slice(0, 4), [
    ["network", { proxy: "http://proxy.example:8080", ca: "system" }],
    ["ui"],
    ["memory", undefined],
    ["mcp", "D:/repo"],
  ]);
  assert.equal(calls.findIndex(([name]) => name === "network") < calls.findIndex(([name]) => name === "runner"), true);
  await runner.dispose();
  assert.deepEqual(calls.slice(-2), [["dispose"], ["memory-close"]]);

  console.log("  PASS");
}

function createFakeRuntimeDeps(calls) {
  return {
    peer: { notify: () => {} },
    installNetworkEnvironment: (network) => calls.push(["network", network]),
    createRemoteRuntimeUiClient: () => (calls.push(["ui"]), {}),
    MarkdownMemoryStore: class {
      constructor({ root }) { calls.push(["memory", root]); }
      close() { calls.push(["memory-close"]); }
    },
    createMarkdownMemoryTools: () => ({}),
    createCliShellRuntime: () => ({}),
    initializeMcp: async ({ projectDir }) => {
      calls.push(["mcp", projectDir]);
      return { mcpTools: [], mcpInjections: [], clientManager: {} };
    },
    createWebToolsFromConfig: () => (calls.push(["web"]), {}),
    createLogger: () => ({}),
    installProcessLogHandlers: () => calls.push(["log-handlers"]),
    resolvePiSessionManager: () => ({}),
    createMarchAuthStorage: () => ({ authStorage: {} }),
    createModelContextDumper: () => ({}),
    createDesktopTurnNotifier: () => ({}),
    createRunner: async () => {
      calls.push(["runner"]);
      return { dispose: async () => calls.push(["dispose"]) };
    },
  };
}
