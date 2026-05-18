import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runProviderShareCommandSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: provider share command ---");
  const { runProviderShareCommand } = await import("../src/provider/share-command.mjs");
  const { runProviderAcceptCommand } = await import("../src/provider/accept-command.mjs");
  const { parseProviderShareToken } = await import("../src/provider/share-payload.mjs");

  const sourceDir = setupTmp();
  const configPath = join(sourceDir, ".march", "config.json");
  mkdirSync(join(sourceDir, ".march"), { recursive: true });
  writeFileSync(configPath, JSON.stringify({
    provider: "keep-current-provider",
    model: "keep-current-model",
    providers: {
      ephone: {
        type: "openai-compatible",
        name: "yifeng",
        baseUrl: "https://api.ephone.ai/v1",
        api: "openai-completions",
        auth: { method: "apiKey", apiKey: "sk-company" },
        models: [{ id: "claude-opus-4-7", name: "claude-opus-4-7", contextWindow: 256000, maxTokens: 8192 }],
      },
    },
  }, null, 2));

  const shareOutput = [];
  const shareCode = await runProviderShareCommand({
    homeDir: sourceDir,
    output: { write: (text) => shareOutput.push(text) },
    select: async ({ items, message }) => {
      if (message.includes("provider")) return items.find((item) => item.value === "ephone").value;
      return "full";
    },
  });
  assert.equal(shareCode, 0);
  assert.ok(shareOutput.join("").includes("Choose") === false);
  const token = shareOutput.join("").match(/march-provider-v1\.[A-Za-z0-9_-]+/)?.[0];
  assert.ok(token);

  const payload = parseProviderShareToken(token);
  assert.equal(payload.providerId, "ephone");
  assert.equal(payload.provider.auth.apiKey, "sk-company");
  assert.deepEqual(payload.provider.models, [{ id: "claude-opus-4-7", name: "claude-opus-4-7", contextWindow: 256000, maxTokens: 8192 }]);

  const profileOutput = [];
  const profileCode = await runProviderShareCommand({
    homeDir: sourceDir,
    providerId: "ephone",
    profileOnly: true,
    output: { write: (text) => profileOutput.push(text) },
  });
  assert.equal(profileCode, 0);
  const profileToken = profileOutput.join("").match(/march-provider-v1\.[A-Za-z0-9_-]+/)?.[0];
  assert.equal(parseProviderShareToken(profileToken).provider.auth.apiKey, undefined);

  const targetDir = setupTmp();
  const acceptOutput = [];
  const acceptCode = await runProviderAcceptCommand({
    homeDir: targetDir,
    token,
    output: { write: (text) => acceptOutput.push(text) },
    select: async ({ items }) => items[0].value,
  });
  assert.equal(acceptCode, 0);
  const targetConfigPath = join(targetDir, ".march", "config.json");
  assert.ok(existsSync(targetConfigPath));
  const targetConfig = JSON.parse(readFileSync(targetConfigPath, "utf8"));
  assert.equal(targetConfig.providers.ephone.auth.apiKey, "sk-company");
  assert.equal(targetConfig.providers.ephone.models[0].contextWindow, 256000);
  assert.ok(!("provider" in targetConfig));
  assert.ok(!("model" in targetConfig));
  assert.ok(acceptOutput.join("").includes("API key: included"));

  cleanup(sourceDir);
  cleanup(targetDir);
  console.log("  PASS");
}
