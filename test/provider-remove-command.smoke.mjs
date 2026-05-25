import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runProviderRemoveCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: provider remove command ---");
  const { runProviderRemoveCommand, listRemovableProviders } = await import("../src/provider/remove-command.mjs");
  const dir = setupTmp();
  try {
    const marchDir = join(dir, ".march");
    mkdirSync(marchDir, { recursive: true });
    const configPath = join(marchDir, "config.json");
    writeFileSync(configPath, JSON.stringify({
      provider: "deepseek",
      model: "deepseek-chat",
      serviceTier: "auto",
      providers: {
        deepseek: { type: "deepseek", auth: { method: "apiKey", apiKey: "sk-test" } },
        openai: { type: "openai", auth: { method: "apiKey", apiKey: "sk-openai" } },
      },
    }, null, 2), "utf8");

    const removedCredentials = [];
    const authStorage = {
      list: () => ["openai-codex"],
      get: (id) => id === "openai-codex" ? { type: "oauth" } : undefined,
      remove: (id) => removedCredentials.push(id),
    };

    const removable = listRemovableProviders({ homeDir: dir, authStorage });
    assert.deepEqual(removable.map((provider) => provider.id), ["deepseek", "openai", "openai-codex"]);

    const output = [];
    const selected = [];
    const code = await runProviderRemoveCommand({
      homeDir: dir,
      output: { write: (text) => output.push(text) },
      select: async ({ items, message }) => {
        selected.push({ message, labels: items.map((item) => item.label) });
        return "deepseek";
      },
      confirm: async ({ provider }) => provider.id === "deepseek",
      authStorage,
    });
    assert.equal(code, 0);
    assert.equal(selected[0].message, "Select provider to remove");
    assert.ok(selected[0].labels.some((label) => label.includes("DeepSeek (deepseek)")));

    const config = JSON.parse(readFileSync(configPath, "utf8"));
    assert.ok(!config.providers.deepseek);
    assert.ok(config.providers.openai);
    assert.ok(!("provider" in config));
    assert.ok(!("model" in config));
    assert.ok(!("serviceTier" in config));
    assert.deepEqual(removedCredentials, ["deepseek"]);
    assert.ok(output.join("").includes("Removed provider: DeepSeek (deepseek)"));

    const oauthOutput = [];
    const oauthCode = await runProviderRemoveCommand({
      homeDir: dir,
      providerId: "openai-codex",
      output: { write: (text) => oauthOutput.push(text) },
      confirm: async () => true,
      authStorage,
    });
    assert.equal(oauthCode, 0);
    assert.deepEqual(removedCredentials, ["deepseek", "openai-codex"]);
    assert.ok(oauthOutput.join("").includes("Removed provider: OpenAI Codex (openai-codex)"));

    const emptyDir = setupTmp();
    const emptyOutput = [];
    const emptyCode = await runProviderRemoveCommand({
      homeDir: emptyDir,
      output: { write: (text) => emptyOutput.push(text) },
      authStorage: { list: () => [], get: () => undefined, remove: () => {} },
    });
    assert.equal(emptyCode, 1);
    assert.ok(emptyOutput.join("").includes("No configured providers to remove."));
    cleanup(emptyDir);
  } finally {
    if (existsSync(dir)) cleanup(dir);
  }
  console.log("  PASS");
}
