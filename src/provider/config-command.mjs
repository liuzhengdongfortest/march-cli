import { createInterface } from "node:readline";
import { globalConfigJsonPath, upsertProviderProfile } from "../config/config-json.mjs";
import { PROVIDER_PRESETS } from "./presets.mjs";

export async function runProviderConfigCommand({
  homeDir,
  input = process.stdin,
  output = process.stdout,
  select = selectWithKeyboard,
  readSecret = readLine,
} = {}) {
  const preset = await select({
    input,
    output,
    message: "Choose provider to configure",
    items: PROVIDER_PRESETS.map((item) => ({ label: item.label, value: item })),
  });
  if (!preset) {
    output.write("Provider configuration cancelled.\n");
    return 1;
  }

  const authMethod = preset.authMethods.length === 1
    ? preset.authMethods[0]
    : await select({
      input,
      output,
      message: "Choose auth method",
      items: preset.authMethods.map((method) => ({ label: formatAuthMethod(method), value: method })),
    });
  if (!authMethod) {
    output.write("Provider configuration cancelled.\n");
    return 1;
  }

  if (authMethod !== "apiKey") {
    output.write(`Unsupported auth method: ${authMethod}\n`);
    return 1;
  }

  const apiKey = String(await readSecret({ input, output, prompt: `${preset.apiKeyLabel}: ` }) ?? "").trim();
  if (!apiKey) {
    output.write("API key is required.\n");
    return 1;
  }

  const path = globalConfigJsonPath(homeDir);
  upsertProviderProfile({
    path,
    id: preset.id,
    type: preset.type,
    auth: { method: "apiKey", apiKey },
  });
  output.write(`Saved provider: ${preset.label}\n`);
  output.write(`Config: ${path}\n`);
  return 0;
}

function formatAuthMethod(method) {
  if (method === "apiKey") return "API key";
  return method;
}

export async function selectWithKeyboard({ input = process.stdin, output = process.stdout, message, items }) {
  if (!items.length) return null;
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    output.write(`${message}:\n`);
    for (let i = 0; i < items.length; i++) output.write(`  ${i + 1}. ${items[i].label}\n`);
    const answer = await readLine({ input, output, prompt: `Select (1-${items.length}): ` });
    const index = Number.parseInt(String(answer).trim(), 10) - 1;
    return items[index]?.value ?? null;
  }

  let selected = 0;
  const render = () => {
    output.write("\x1b[2K\r");
    output.write(`${message}: ${items[selected].label}  (↑/↓, Enter)`);
  };
  return new Promise((resolve) => {
    const onData = (chunk) => {
      const key = chunk.toString("utf8");
      if (key === "\u0003" || key === "\u001b") finish(null);
      else if (key === "\r" || key === "\n") finish(items[selected].value);
      else if (key === "\u001b[A") { selected = (selected - 1 + items.length) % items.length; render(); }
      else if (key === "\u001b[B") { selected = (selected + 1) % items.length; render(); }
    };
    const finish = (value) => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
      resolve(value);
    };
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
    render();
  });
}

function readLine({ input = process.stdin, output = process.stdout, prompt }) {
  const rl = createInterface({ input, output });
  return new Promise((resolve) => rl.question(prompt, (answer) => {
    rl.close();
    resolve(answer);
  }));
}
