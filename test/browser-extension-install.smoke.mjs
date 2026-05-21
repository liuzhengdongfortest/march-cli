import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installedBrowserExtensionPath, syncBrowserExtensionInstall } from "../src/browser/extension-install.mjs";

export async function runBrowserExtensionInstallSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: browser extension install sync ---");

  const stateRoot = setupTmp();
  try {
    const extensionPath = installedBrowserExtensionPath(stateRoot);
    mkdirSync(extensionPath, { recursive: true });
    writeFileSync(join(extensionPath, "stale.txt"), "old", "utf8");

    const syncedPath = syncBrowserExtensionInstall(stateRoot);

    assert.equal(syncedPath, extensionPath);
    assert.ok(existsSync(join(extensionPath, "manifest.json")));
    assert.ok(existsSync(join(extensionPath, "background.js")));
    assert.equal(JSON.parse(readFileSync(join(extensionPath, "manifest.json"), "utf8")).name, "March Browser Bridge");
    assert.equal(existsSync(join(extensionPath, "stale.txt")), false);
  } finally {
    cleanup(stateRoot);
  }

  console.log("  PASS");
}
