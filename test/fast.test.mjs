import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { runBrowserExtensionErrorsSmoke } from "./browser-extension-errors.smoke.mjs";
import { runBrowserExtensionInstallSmoke } from "./browser-extension-install.smoke.mjs";
import { runCodeSearchSmoke } from "./code-search.smoke.mjs";
import { runCommandExecToolSmoke } from "./command-exec-tool.smoke.mjs";
import { runConfigLoadingSmoke } from "./config-loading.smoke.mjs";
import { runNetworkEnvironmentSmoke } from "./network-environment.smoke.mjs";
import { runCustomProviderSmoke } from "./custom-provider.smoke.mjs";
import { runEditFileToolSmoke } from "./edit-file-tool.smoke.mjs";
import { runGatewayCoreSmoke } from "./gateway-core.smoke.mjs";
import { runHistorySearchSmoke } from "./history-search.smoke.mjs";
import { runFileSearchIndexSmoke } from "./file-search-index.smoke.mjs";
import { runPlatformOpenFileSmoke } from "./platform-open-file.smoke.mjs";
import { runProviderConfigCommandSmoke } from "./provider-config-command.smoke.mjs";
import { runProviderRemoveCommandSmoke } from "./provider-remove-command.smoke.mjs";
import { runProviderQuotaSmoke } from "./provider-quota.smoke.mjs";
import { runRunnerProviderRetrySettingsSmoke } from "./runner-provider-retry-settings.smoke.mjs";
import { runRunnerModelErrorSmoke } from "./runner-model-error.smoke.mjs";
import { runReadFileToolSmoke } from "./read-file-tool.smoke.mjs";
import { runReadImageToolSmoke } from "./read-image-tool.smoke.mjs";
import { runScreenToolsSmoke } from "./screen-tools.smoke.mjs";
import { runSendBinaryToolSmoke } from "./send-binary-tool.smoke.mjs";
import { runSessionControllerLeaseSmoke } from "./session-controller-lease.smoke.mjs";
import { runSourceDirectoryLimitSmoke } from "./source-directory-limit.smoke.mjs";
import { runSourceLineLimitSmoke } from "./source-line-limit.smoke.mjs";
import { runStartupBannerSmoke } from "./startup-banner.smoke.mjs";
import { runWebUiSmoke } from "./web-ui.smoke.mjs";
import { runRemoteMemorySmoke } from "./remote-memory.smoke.mjs";
import { runRuntimeRestartLifecycleSmoke } from "./runtime-restart-lifecycle.smoke.mjs";
import { runWorkspaceRegistrySmoke } from "./workspace-registry.smoke.mjs";
function setupTmp() {
  const dir = resolve(tmpdir(), `march-fast-smoke-${randomUUID().slice(0, 8)}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

{
  console.log("--- fast smoke: memory recall candidate display ---");
  const { selectDisplayedRecallCandidates } = await import("../src/cli/tui/recall-rendering.mjs");
  const recalled = (id) => ({ id, recalled: true });
  const skipped = (id) => ({ id, recalled: false });

  assert.deepEqual(selectDisplayedRecallCandidates([
    recalled("r1"), recalled("r2"), recalled("r3"), skipped("s1"), skipped("s2"), skipped("s3"),
  ]).map((candidate) => candidate.id), ["r1", "r2", "r3", "s1", "s2"]);
  assert.deepEqual(selectDisplayedRecallCandidates([
    recalled("r1"), skipped("s1"), skipped("s2"), skipped("s3"),
  ]).map((candidate) => candidate.id), ["r1", "s1", "s2"]);
  assert.deepEqual(selectDisplayedRecallCandidates([
    skipped("s1"), skipped("s2"), skipped("s3"),
  ]).map((candidate) => candidate.id), ["s1", "s2"]);
  console.log("  PASS");
}

{
  console.log("--- fast smoke: CLI args parsing ---");
  const { parseCliArgs } = await import("../src/cli/args.mjs");

  const args = parseCliArgs(["-m", "deepseek-chat", "--json", "-e", "ext.ts", "hello world"]);
  assert.equal(args.model, "deepseek-chat");
  assert.equal(args.json, true);
  assert.deepEqual(args.extensions, ["ext.ts"]);
  assert.equal(args.prompt, "hello world");
  assert.equal(args.command, null);

  const providerShare = parseCliArgs(["provider", "share", "ephone", "--include-key"]);
  assert.deepEqual(providerShare.command, { name: "provider", args: ["share", "ephone"] });
  assert.equal(providerShare.includeKey, true);

  const memoryServe = parseCliArgs(["memory", "serve", "notes", "--host", "127.0.0.1", "--port", "4321", "--name", "team"]);
  assert.deepEqual(memoryServe.command, { name: "memory", args: ["serve", "notes"] });
  assert.equal(memoryServe.host, "127.0.0.1");
  assert.equal(memoryServe.port, "4321");
  assert.equal(memoryServe.name, "team");

  const browserInstall = parseCliArgs(["browser", "install"]);
  assert.deepEqual(browserInstall.command, { name: "browser", args: ["install"] });

  const gatewaySetup = parseCliArgs(["gateway", "setup"]);
  assert.deepEqual(gatewaySetup.command, { name: "gateway", args: ["setup"] });

  const gatewayStatus = parseCliArgs(["gateway", "status"]);
  assert.deepEqual(gatewayStatus.command, { name: "gateway", args: ["status"] });

  const tmpWorkspace = setupTmp();
  const childWorkspace = resolve(tmpWorkspace, "project");
  mkdirSync(childWorkspace, { recursive: true });
  const web = parseCliArgs(["web", tmpWorkspace, "--host", "127.0.0.1", "--port", "4174"]);
  assert.deepEqual(web.command, { name: "web", args: [tmpWorkspace] });
  assert.equal(web.host, "127.0.0.1");
  assert.equal(web.port, "4174");

  const webDev = parseCliArgs(["web", "--dev", "--api-port", "5175"]);
  assert.deepEqual(webDev.command, { name: "web", args: [] });
  assert.equal(webDev.dev, true);
  assert.equal(webDev.apiPort, "5175");

  const webWithWorkspaceOption = parseCliArgs(["web", "--workspace", tmpWorkspace]);
  assert.deepEqual(webWithWorkspaceOption.command, { name: "web", args: [] });
  assert.equal(webWithWorkspaceOption.workspace, tmpWorkspace);
  const { resolveInitialWorkspace } = await import("../src/web-ui/command.mjs");
  try {
    assert.equal(resolveInitialWorkspace(web, "C:/launcher"), resolve(tmpWorkspace));
    assert.equal(resolveInitialWorkspace(parseCliArgs(["web", "project"]), tmpWorkspace), childWorkspace);
    assert.equal(resolveInitialWorkspace(parseCliArgs(["web"]), tmpWorkspace), null);
    assert.throws(() => resolveInitialWorkspace(parseCliArgs(["web", tmpWorkspace, "extra"]), tmpWorkspace), /Usage: march web/);
    assert.throws(() => resolveInitialWorkspace(parseCliArgs(["web", tmpWorkspace, "--workspace", tmpWorkspace]), tmpWorkspace), /Use either/);
  } finally {
    cleanup(tmpWorkspace);
  }

  assert.ok(!readFileSync("bin/march.mjs", "utf8").includes("process.exit("));
  assert.ok(!readFileSync("src/main.mjs", "utf8").includes("process.exit("));
  console.log("  PASS");
}

await runSourceLineLimitSmoke();
await runSourceDirectoryLimitSmoke();
await runStartupBannerSmoke();
await runWebUiSmoke();
await runConfigLoadingSmoke({ setupTmp, cleanup });
await runGatewayCoreSmoke({ setupTmp, cleanup });
await runHistorySearchSmoke({ setupTmp, cleanup });
await runNetworkEnvironmentSmoke();
await runBrowserExtensionErrorsSmoke();
await runBrowserExtensionInstallSmoke({ setupTmp, cleanup });
await runCommandExecToolSmoke();
await runCodeSearchSmoke({ setupTmp, cleanup });
await runReadFileToolSmoke({ setupTmp, cleanup });
await runReadImageToolSmoke({ setupTmp, cleanup });
await runScreenToolsSmoke();
await runSendBinaryToolSmoke({ setupTmp, cleanup });
await runSessionControllerLeaseSmoke({ setupTmp, cleanup });
await runRunnerProviderRetrySettingsSmoke({ setupTmp, cleanup });
await runRunnerModelErrorSmoke({ setupTmp, cleanup });
await runEditFileToolSmoke({ setupTmp, cleanup });
await runFileSearchIndexSmoke();
await runPlatformOpenFileSmoke();
await runProviderConfigCommandSmoke({ setupTmp, cleanup });
await runProviderRemoveCommandSmoke({ setupTmp, cleanup });
await runProviderQuotaSmoke();
await runCustomProviderSmoke();
await runRemoteMemorySmoke({ setupTmp, cleanup });
await runRuntimeRestartLifecycleSmoke({ setupTmp, cleanup });
await runWorkspaceRegistrySmoke({ setupTmp, cleanup });
console.log("All fast smoke tests passed.");
