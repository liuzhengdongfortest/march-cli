import { createInterface } from "node:readline";
import { AuthStorage } from "@mariozechner/pi-coding-agent";
import { globalConfigJsonPath, upsertProviderProfile } from "../config/config-json.mjs";
import { getMarchAuthPath } from "../auth/storage.mjs";
import { PROVIDER_PRESETS } from "./presets.mjs";

export async function runProviderConfigCommand({
  homeDir,
  input = process.stdin,
  output = process.stdout,
  select = selectWithKeyboard,
  readSecret = readLine,
  authStorage = AuthStorage.create(getMarchAuthPath(homeDir)),
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

  if (authMethod === "oauth") {
    return runOAuthConfig({ preset, authStorage, input, output, homeDir });
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
  if (method === "oauth") return "OAuth / subscription";
  return method;
}

async function runOAuthConfig({ preset, authStorage, input, output, homeDir }) {
  const rl = createInterface({ input, output });
  try {
    output.write(`Logging in to ${preset.label}...\n`);
    await authStorage.login(preset.type, {
      onAuth: (info) => {
        output.write(`\nOpen this URL in your browser:\n${info.url}\n`);
        if (info.instructions) output.write(`${info.instructions}\n`);
        output.write("\n");
      },
      onPrompt: (prompt) => ask(rl, `${prompt.message}${prompt.placeholder ? ` (${prompt.placeholder})` : ""}: `),
      onManualCodeInput: () => ask(rl, "Paste redirect URL or code: "),
      onProgress: (message) => output.write(`${message}\n`),
      onSelect: async (prompt) => selectOAuthOption({ prompt, rl, output }),
    });
    output.write(`\nCredentials saved to ${getMarchAuthPath(homeDir)}\n`);
    return 0;
  } catch (error) {
    output.write(`OAuth login failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    rl.close();
  }
}

async function selectOAuthOption({ prompt, rl, output }) {
  output.write(`${prompt.message}\n`);
  for (let i = 0; i < prompt.options.length; i++) {
    const option = prompt.options[i];
    output.write(`  ${i + 1}. ${option.label} (${option.id})\n`);
  }
  const answer = await ask(rl, `Enter option id or number (1-${prompt.options.length}): `);
  return resolveSelection(answer, prompt.options);
}

function resolveSelection(answer, options) {
  const trimmed = answer.trim();
  const index = Number.parseInt(trimmed, 10);
  if (Number.isInteger(index) && String(index) === trimmed && index >= 1 && index <= options.length) {
    return options[index - 1].id;
  }
  return options.some((option) => option.id === trimmed) ? trimmed : undefined;
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
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
  let renderedLines = 0;
  const render = () => {
    if (renderedLines > 0) output.write(`\x1b[${renderedLines}F`);
    const lines = formatSelectionList({ message, items, selected });
    for (const line of lines) output.write(`\x1b[2K\r${line}\n`);
    renderedLines = lines.length;
  };
  return new Promise((resolve) => {
    let finished = false;
    const onData = (chunk) => {
      const keys = chunk.toString("utf8").match(/\u001b\[[AB]|\r|\n|\u0003|\u001b/g) ?? [];
      for (const key of keys) {
        if (finished) return;
        if (key === "\u0003" || key === "\u001b") finish(null);
        else if (key === "\r" || key === "\n") finish(items[selected].value);
        else if (key === "\u001b[A") { selected = (selected - 1 + items.length) % items.length; render(); }
        else if (key === "\u001b[B") { selected = (selected + 1) % items.length; render(); }
      }
    };
    const finish = (value) => {
      finished = true;
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      if (renderedLines > 0) output.write(`\x1b[${renderedLines}F`);
      const lines = formatSelectionList({ message, items, selected, done: value != null });
      for (const line of lines) output.write(`\x1b[2K\r${line}\n`);
      resolve(value);
    };
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
    render();
  });
}

export function formatSelectionList({ message, items, selected, done = false }) {
  const hint = done ? "selected" : "↑/↓, Enter";
  const lines = [`${message} (${hint})`];
  for (let i = 0; i < items.length; i++) {
    const marker = i === selected ? "›" : " ";
    const label = `${marker} ${items[i].label}`;
    lines.push(i === selected ? `\x1b[7m${label}\x1b[0m` : label);
  }
  return lines;
}

function readLine({ input = process.stdin, output = process.stdout, prompt }) {
  const rl = createInterface({ input, output });
  return new Promise((resolve) => rl.question(prompt, (answer) => {
    rl.close();
    resolve(answer);
  }));
}
