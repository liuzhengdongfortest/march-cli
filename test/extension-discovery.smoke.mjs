import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runExtensionDiscoverySmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: extension discovery ---");
  const { discoverProjectExtensionPaths } = await import("../src/extensions/discovery.mjs");
  const dir = setupTmp();

  assert.deepEqual(discoverProjectExtensionPaths(dir), []);

  const extensionsDir = join(dir, ".march", "extensions");
  mkdirSync(extensionsDir, { recursive: true });
  writeFileSync(join(extensionsDir, "b.ts"), "export default function() {}\n");
  writeFileSync(join(extensionsDir, "a.js"), "export default function() {}\n");
  writeFileSync(join(extensionsDir, "note.md"), "# ignored\n");

  const nestedDir = join(extensionsDir, "nested");
  mkdirSync(nestedDir, { recursive: true });
  writeFileSync(join(nestedDir, "index.mjs"), "export default function() {}\n");
  writeFileSync(join(nestedDir, "helper.js"), "export const helper = true;\n");

  const noIndexDir = join(extensionsDir, "no-index");
  mkdirSync(noIndexDir, { recursive: true });
  writeFileSync(join(noIndexDir, "plugin.js"), "export default function() {}\n");

  const paths = discoverProjectExtensionPaths(dir).map((path) => path.replace(/\\/g, "/"));
  assert.deepEqual(paths, [
    `${extensionsDir}/a.js`.replace(/\\/g, "/"),
    `${extensionsDir}/b.ts`.replace(/\\/g, "/"),
    `${nestedDir}/index.mjs`.replace(/\\/g, "/"),
  ]);

  cleanup(dir);
  console.log("  PASS");
}
