import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { visibleWidth } from "@earendil-works/pi-tui";
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
import { runAvatarsSmoke } from "./avatars.smoke.mjs";
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

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
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
  console.log("--- fast smoke: TUI output content width ---");
  const { OutputBuffer } = await import("../src/cli/tui/output-buffer.mjs");
  const output = new OutputBuffer();
  output.addThinkingBlock(12, ["x".repeat(78)]);
  const wideLines = output.render(80);
  assert.equal(visibleWidth(wideLines[1]), 80);
  assert.ok(stripAnsi(wideLines[1]).startsWith(`  ${"x".repeat(78)}`));

  const narrow = new OutputBuffer();
  narrow.addThinkingBlock(1, ["abcd"]);
  assert.equal(narrow.render(4).slice(1).every((line) => visibleWidth(line) <= 4), true);
  console.log("  PASS");
}

{
  console.log("--- fast smoke: input surface preserves background through styled text ---");
  const { StatusBar } = await import("../src/cli/tui/status/status-bar.mjs");
  const line = new StatusBar().renderInputLine("\x1b[37mhello\x1b[0m", 20);
  const bgPrefix = line.match(/\x1b\[48;5;\d+m/)?.[0];
  assert.ok(bgPrefix);
  const resetAfterText = line.indexOf("\x1b[0m", line.indexOf("hello") + "hello".length);
  assert.notEqual(resetAfterText, -1);
  assert.equal(line.slice(resetAfterText + "\x1b[0m".length, resetAfterText + "\x1b[0m".length + bgPrefix.length), bgPrefix);
  console.log("  PASS");
}

{
  console.log("--- fast smoke: status bar model download activity ---");
  const { createStatusLineUpdater } = await import("../src/cli/status-line-updater.mjs");
  let line = "";
  const updater = createStatusLineUpdater({
    ui: { setStatusBar: (value) => { line = value; } },
    runner: { engine: { modelId: "test-model", thinkingLevel: "auto" } },
    sessionState: { sessionId: "s1" },
  });
  updater.updateModelDownload({ phase: "downloading", percent: 42 });
  assert.match(stripAnsi(line), /Downloading Model 42%/);
  updater.stopModelDownload();
  assert.doesNotMatch(stripAnsi(line), /Downloading Model/);
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

  const webPrompt = parseCliArgs(["web", "hello"]);
  assert.equal(webPrompt.command, null);
  assert.equal(webPrompt.prompt, "web hello");

  assert.ok(!readFileSync("bin/march.mjs", "utf8").includes("process.exit("));
  assert.ok(!readFileSync("src/main.mjs", "utf8").includes("process.exit("));
  console.log("  PASS");
}

await runSourceLineLimitSmoke();
await runSourceDirectoryLimitSmoke();
await runStartupBannerSmoke();
await runAvatarsSmoke({ setupTmp, cleanup });
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
