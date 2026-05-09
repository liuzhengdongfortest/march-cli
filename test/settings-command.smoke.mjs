import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runSettingsCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: settings command ---");
  const {
    handleSettingsCommand,
    parseSettingsCommand,
  } = await import("../src/config/settings-command.mjs");
  const { loadConfig } = await import("../src/config/loader.mjs");

  assert.deepEqual(parseSettingsCommand("hello"), { type: "none" });
  assert.deepEqual(parseSettingsCommand("/settings"), { type: "view" });
  assert.deepEqual(parseSettingsCommand("/settings set project model test-model"), {
    type: "set",
    scope: "project",
    key: "model",
    value: "test-model",
  });
  assert.deepEqual(parseSettingsCommand("/settings unset global provider"), {
    type: "unset",
    scope: "global",
    key: "provider",
  });
  assert.equal(parseSettingsCommand("/settings set bad model x").type, "error");

  const cwd = setupTmp();
  const homeDir = setupTmp();
  mkdirSync(join(homeDir, ".march"), { recursive: true });
  writeFileSync(join(homeDir, ".march", "config"), JSON.stringify({ provider: "openai", model: "gpt-test" }));
  assert.equal(loadConfig(cwd, { homeDir }).provider, "openai");

  const setLines = handleSettingsCommand(parseSettingsCommand("/settings set project model project-model"), { cwd, homeDir });
  assert.ok(setLines.join("\n").includes("Settings updated: project.model"));
  assert.ok(setLines.join("\n").includes("next March startup"));
  const projectConfigPath = join(cwd, ".march", "config");
  assert.equal(JSON.parse(readFileSync(projectConfigPath, "utf8")).model, "project-model");
  assert.equal(loadConfig(cwd, { homeDir }).model, "project-model");

  const viewLines = handleSettingsCommand(parseSettingsCommand("/settings"), { cwd, homeDir }).join("\n");
  assert.ok(viewLines.includes("merged.provider: openai"));
  assert.ok(viewLines.includes("merged.model: project-model"));

  const unsetLines = handleSettingsCommand(parseSettingsCommand("/settings unset project model"), { cwd, homeDir });
  assert.ok(unsetLines.join("\n").includes("Settings unset: project.model"));
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(projectConfigPath, "utf8")), "model"), false);
  assert.equal(loadConfig(cwd, { homeDir }).model, "gpt-test");

  const emptyHome = setupTmp();
  const emptyView = handleSettingsCommand(parseSettingsCommand("/settings"), { cwd: setupTmp(), homeDir: emptyHome }).join("\n");
  assert.ok(emptyView.includes("(empty)"));
  assert.equal(existsSync(join(emptyHome, ".march", "config")), false);
  cleanup(cwd);
  cleanup(homeDir);
  cleanup(emptyHome);
  console.log("  PASS");
}
