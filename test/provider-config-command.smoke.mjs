import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";

export async function runProviderConfigCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: provider config command ---");
  const { runProviderConfigCommand } = await import("../src/provider/config-command.mjs");
  const { PROVIDER_PRESETS } = await import("../src/provider/presets.mjs");
  assert.ok(PROVIDER_PRESETS.some((provider) => provider.id === "openrouter"));
  assert.ok(PROVIDER_PRESETS.some((provider) => provider.id === "supergrok-oauth"));
  assert.ok(PROVIDER_PRESETS.some((provider) => provider.authMethods.includes("oauth")));
  const dir = setupTmp();
  const output = [];
  const code = await runProviderConfigCommand({
    homeDir: dir,
    output: { write: (text) => output.push(text) },
    select: async ({ items }) => items.find((item) => item.value.id === "deepseek")?.value ?? items[0].value,
    readSecret: async () => "sk-test",
  });
  assert.equal(code, 0);
  const configPath = join(dir, ".march", "config.json");
  assert.ok(existsSync(configPath));
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  assert.equal(config.providers.deepseek.type, "deepseek");
  assert.equal(config.providers.deepseek.auth.method, "apiKey");
  assert.equal(config.providers.deepseek.auth.apiKey, "sk-test");
  assert.ok(!("provider" in config));
  assert.ok(!("model" in config));
  assert.ok(output.join("").includes("Saved provider: DeepSeek"));

  const oauthDir = setupTmp();
  const oauthOutput = [];
  const oauthCode = await runProviderConfigCommand({
    homeDir: oauthDir,
    output: { write: (text) => oauthOutput.push(text) },
    select: async ({ items, message }) => {
      if (message.includes("provider")) return items.find((item) => item.value.authMethods.includes("oauth")).value;
      return items.find((item) => item.value === "oauth").value;
    },
    authStorage: { login: async (provider) => oauthOutput.push(`oauth:${provider}\n`) },
  });
  assert.equal(oauthCode, 0);
  assert.ok(oauthOutput.join("").includes("oauth:"));
  cleanup(oauthDir);

  const { formatSelectionList } = await import("../src/provider/config-command.mjs");
  const lines = formatSelectionList({
    message: "Choose provider to configure",
    items: [{ label: "DeepSeek" }, { label: "OpenAI" }],
    selected: 1,
  });
  assert.equal(lines[0], "Choose provider to configure (↑/↓, Enter)");
  assert.ok(lines[1].includes("DeepSeek"));
  assert.ok(lines[2].includes("\x1b[7m› OpenAI\x1b[0m"));

  const { selectWithKeyboard } = await import("../src/provider/config-command.mjs");
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => {};
  const ttyOutput = [];
  const selected = selectWithKeyboard({
    input,
    output: { isTTY: true, write: (text) => ttyOutput.push(text) },
    message: "Choose provider to configure",
    items: [{ label: "DeepSeek", value: "deepseek" }, { label: "OpenAI", value: "openai" }],
  });
  input.write("\x1b[B\r");
  assert.equal(await selected, "openai");
  assert.ok(ttyOutput.join("").includes("\x1b[7m› OpenAI\x1b[0m"));
  cleanup(dir);
  console.log("  PASS");
}
