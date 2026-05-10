import { strict as assert } from "node:assert";
import { PassThrough, Writable } from "node:stream";

export async function runLoginCommandSmoke() {
  console.log("--- smoke: login command ---");
  const { formatProviderList, runLoginCommand } = await import("../src/auth/login-command.mjs");

  const providers = [
    { id: "anthropic", name: "Anthropic" },
    { id: "openai-codex", name: "OpenAI Codex" },
  ];
  assert.ok(formatProviderList(providers).includes("openai-codex"));

  const input = new PassThrough();
  setTimeout(() => input.write("2\n"), 0);
  setTimeout(() => {
    input.write("typed-code\n");
    input.end();
  }, 10);
  const output = captureOutput();
  const authPath = "C:/Users/test/.march/auth.json";
  const calls = [];
  const authStorage = {
    getOAuthProviders: () => providers,
    login: async (providerId, callbacks) => {
      calls.push(providerId);
      callbacks.onAuth({ url: "https://example.test/oauth", instructions: "Follow browser steps." });
      callbacks.onProgress("Waiting for callback");
      const selected = await callbacks.onSelect({
        message: "Choose login method",
        options: [
          { id: "manual", label: "Manual" },
          { id: "browser", label: "Browser" },
        ],
      });
      assert.equal(selected, "browser");
      const promptValue = await callbacks.onPrompt({ message: "Code" });
      assert.equal(promptValue, "typed-code");
    },
  };

  const code = await runLoginCommand({
    providerId: "openai-codex",
    authStorage,
    authPath,
    input,
    output,
  });
  assert.equal(code, 0);
  assert.deepEqual(calls, ["openai-codex"]);
  assert.ok(output.text().includes(`Credentials saved to ${authPath}`));

  const missingOutput = captureOutput();
  const missingCode = await runLoginCommand({
    providerId: "missing",
    authStorage,
    input: new PassThrough(),
    output: missingOutput,
  });
  assert.equal(missingCode, 1);
  assert.ok(missingOutput.text().includes("Unknown OAuth provider"));
  console.log("  PASS");
}

function captureOutput() {
  let data = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      data += chunk.toString();
      callback();
    },
  });
  stream.text = () => data;
  return stream;
}
