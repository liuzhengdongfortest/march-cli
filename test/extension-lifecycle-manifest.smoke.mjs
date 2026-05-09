import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runExtensionLifecycleManifestSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: extension lifecycle manifests ---");
  const {
    discoverProjectLifecycleHookManifestPaths,
    loadProjectLifecycleHookManifests,
  } = await import("../src/extensions/lifecycle-manifest.mjs");

  const dir = setupTmp();
  const extensionsDir = join(dir, ".march", "extensions");
  mkdirSync(extensionsDir, { recursive: true });
  writeFileSync(join(extensionsDir, "a.march-hooks.json"), JSON.stringify({
    hooks: [
      {
        id: "manifest-observer",
        kind: "march-agent-runtime:after-turn",
        effects: ["read-session-ref", "write-diagnostics"],
        description: "Observe March runtime turns.",
      },
    ],
  }));
  const nestedDir = join(extensionsDir, "nested");
  mkdirSync(nestedDir);
  writeFileSync(join(nestedDir, "march-hooks.json"), JSON.stringify([
    {
      id: "manifest-collab",
      kind: "march-collaboration:after-message",
      effects: ["read-group-ref"],
    },
  ]));
  writeFileSync(join(extensionsDir, "broken.march-hooks.json"), "{");

  const paths = discoverProjectLifecycleHookManifestPaths(dir).map((path) => path.replace(/\\/g, "/"));
  assert.deepEqual(paths, [
    `${extensionsDir}/a.march-hooks.json`.replace(/\\/g, "/"),
    `${extensionsDir}/broken.march-hooks.json`.replace(/\\/g, "/"),
    `${nestedDir}/march-hooks.json`.replace(/\\/g, "/"),
  ]);

  const loaded = loadProjectLifecycleHookManifests(dir);
  assert.equal(loaded.hooks.length, 2);
  assert.equal(loaded.hooks[0].id, "manifest-observer");
  assert.equal(loaded.hooks[0].sourcePath.endsWith("a.march-hooks.json"), true);
  assert.equal(loaded.diagnostics.length, 1);
  assert.ok(loaded.diagnostics[0].message.includes("Failed to load March lifecycle hook manifest"));
  cleanup(dir);
  console.log("  PASS");
}
