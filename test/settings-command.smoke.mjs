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
  assert.deepEqual(parseSettingsCommand("/settings set project memoryRoot D:/mem"), {
    type: "set",
    scope: "project",
    key: "memoryRoot",
    value: "D:/mem",
  });
  assert.deepEqual(parseSettingsCommand("/settings unset global memoryRoot"), {
    type: "unset",
    scope: "global",
    key: "memoryRoot",
  });
  assert.equal(parseSettingsCommand("/settings set bad model x").type, "error");

  const cwd = setupTmp();
  const homeDir = setupTmp();
  mkdirSync(join(homeDir, ".march"), { recursive: true });
  writeFileSync(join(homeDir, ".march", "config.json"), JSON.stringify({ providers: { openai: { type: "openai", auth: { method: "apiKey", apiKey: "sk" } } } }));
  assert.equal(loadConfig(cwd, { homeDir }).providers.openai.type, "openai");

  const setLines = handleSettingsCommand(parseSettingsCommand("/settings set project memoryRoot D:/project-memory"), { cwd, homeDir });
  assert.ok(setLines.join("\n").includes("Settings updated: project.memoryRoot"));
  assert.ok(setLines.join("\n").includes("next March startup"));
  const projectConfigPath = join(cwd, ".march", "config");
  assert.equal(JSON.parse(readFileSync(projectConfigPath, "utf8")).memoryRoot, "D:/project-memory");
  assert.equal(loadConfig(cwd, { homeDir }).memoryRoot, "D:/project-memory");

  const viewLines = handleSettingsCommand(parseSettingsCommand("/settings"), { cwd, homeDir }).join("\n");
  assert.ok(viewLines.includes("configured.providers: openai"));

  const unsetLines = handleSettingsCommand(parseSettingsCommand("/settings unset project memoryRoot"), { cwd, homeDir });
  assert.ok(unsetLines.join("\n").includes("Settings unset: project.memoryRoot"));
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(projectConfigPath, "utf8")), "memoryRoot"), false);

  const emptyHome = setupTmp();
  const emptyView = handleSettingsCommand(parseSettingsCommand("/settings"), { cwd: setupTmp(), homeDir: emptyHome }).join("\n");
  assert.ok(emptyView.includes("(empty)"));
  assert.equal(existsSync(join(emptyHome, ".march", "config")), false);
  cleanup(cwd);
  cleanup(homeDir);
  cleanup(emptyHome);
  console.log("  PASS");
}
