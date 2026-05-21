import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { runBrowserExtensionErrorsSmoke } from "./browser-extension-errors.smoke.mjs";
import { runBrowserExtensionInstallSmoke } from "./browser-extension-install.smoke.mjs";
import { runCommandExecToolSmoke } from "./command-exec-tool.smoke.mjs";
import { runConfigLoadingSmoke } from "./config-loading.smoke.mjs";
import { runNetworkEnvironmentSmoke } from "./network-environment.smoke.mjs";
import { runCustomProviderSmoke } from "./custom-provider.smoke.mjs";
import { runEditFileToolSmoke } from "./edit-file-tool.smoke.mjs";
import { runGatewayCoreSmoke } from "./gateway-core.smoke.mjs";
import { runFileSearchIndexSmoke } from "./file-search-index.smoke.mjs";
import { runProviderConfigCommandSmoke } from "./provider-config-command.smoke.mjs";
import { runReadFileToolSmoke } from "./read-file-tool.smoke.mjs";
import { runReadImageToolSmoke } from "./read-image-tool.smoke.mjs";
import { runScreenToolsSmoke } from "./screen-tools.smoke.mjs";
import { runSourceDirectoryLimitSmoke } from "./source-directory-limit.smoke.mjs";
import { runSourceLineLimitSmoke } from "./source-line-limit.smoke.mjs";
import { runStartupBannerSmoke } from "./startup-banner.smoke.mjs";
import { runRemoteMemorySmoke } from "./remote-memory.smoke.mjs";
function setupTmp() {
  const dir = resolve(tmpdir(), `march-fast-smoke-${randomUUID().slice(0, 8)}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
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

  const gatewayStatus = parseCliArgs(["gateway", "status"]);
  assert.deepEqual(gatewayStatus.command, { name: "gateway", args: ["status"] });

  assert.ok(!readFileSync("bin/march.mjs", "utf8").includes("process.exit("));
  assert.ok(!readFileSync("src/main.mjs", "utf8").includes("process.exit("));
  console.log("  PASS");
}

await runSourceLineLimitSmoke();
await runSourceDirectoryLimitSmoke();
await runStartupBannerSmoke();
await runConfigLoadingSmoke({ setupTmp, cleanup });
await runGatewayCoreSmoke({ setupTmp, cleanup });
await runNetworkEnvironmentSmoke();
await runBrowserExtensionErrorsSmoke();
await runBrowserExtensionInstallSmoke({ setupTmp, cleanup });
await runCommandExecToolSmoke();
await runReadFileToolSmoke({ setupTmp, cleanup });
await runReadImageToolSmoke({ setupTmp, cleanup });
await runScreenToolsSmoke();
await runEditFileToolSmoke({ setupTmp, cleanup });
await runFileSearchIndexSmoke();
await runProviderConfigCommandSmoke({ setupTmp, cleanup });
await runCustomProviderSmoke();
await runRemoteMemorySmoke({ setupTmp, cleanup });
console.log("All fast smoke tests passed.");
