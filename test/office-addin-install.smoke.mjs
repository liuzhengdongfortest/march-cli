import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installedOfficeAddinPath, syncOfficeAddinInstall } from "../src/office/addin-install.mjs";

export async function runOfficeAddinInstallSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: office add-in install sync ---");

  const stateRoot = setupTmp();
  try {
    const addinPath = installedOfficeAddinPath(stateRoot);
    mkdirSync(addinPath, { recursive: true });
    writeFileSync(join(addinPath, "stale.txt"), "old", "utf8");

    const syncedPath = syncOfficeAddinInstall(stateRoot);

    assert.equal(syncedPath, addinPath);
    assert.ok(existsSync(join(addinPath, "manifest.xml")));
    assert.ok(existsSync(join(addinPath, "taskpane.html")));
    assert.ok(readFileSync(join(addinPath, "manifest.xml"), "utf8").includes("March PowerPoint Bridge"));
    assert.equal(existsSync(join(addinPath, "stale.txt")), false);
  } finally {
    cleanup(stateRoot);
  }

  console.log("  PASS");
}
