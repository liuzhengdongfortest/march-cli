import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runConfigLoadingSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: config loading ---");
  const { loadConfig } = await import("../src/config/loader.mjs");
  const dir = setupTmp();

  const empty = loadConfig(dir);
  assert.equal(empty.model, "deepseek-chat");
  assert.equal(empty.provider, "deepseek");
  assert.deepEqual(empty.skills, []);
  assert.deepEqual(empty.pins, []);

  writeFileSync(join(dir, ".marchrc"), JSON.stringify({ model: "test-model", skills: ["s1"], pins: ["p1"] }));
  const withRc = loadConfig(dir);
  assert.equal(withRc.model, "test-model");
  assert.deepEqual(withRc.skills, ["s1"]);
  assert.deepEqual(withRc.pins, ["p1"]);

  const marchDir = join(dir, ".march");
  mkdirSync(marchDir, { recursive: true });
  writeFileSync(join(marchDir, "config"), JSON.stringify({ model: "override-model", pins: ["p2"] }));
  const withBoth = loadConfig(dir);
  assert.equal(withBoth.model, "override-model");
  assert.deepEqual(withBoth.pins.sort(), ["p1", "p2"].sort());

  cleanup(dir);
  console.log("  PASS");
}
