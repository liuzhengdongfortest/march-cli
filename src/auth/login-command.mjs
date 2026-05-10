import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { AuthStorage } from "@mariozechner/pi-coding-agent";
import { getMarchAuthPath } from "./storage.mjs";

export async function runLoginCommand({
  providerId,
  homeDir = homedir(),
  authPath = getMarchAuthPath(homeDir),
  authStorage = AuthStorage.create(authPath),
  input = process.stdin,
  output = process.stdout,
} = {}) {
  const providers = authStorage.getOAuthProviders?.() ?? [];
  const selectedProvider = providerId || await selectProvider({ providers, input, output });
  if (!selectedProvider) {
    output.write("Login cancelled.\n");
    return 1;
  }

  if (!providers.some((provider) => provider.id === selectedProvider)) {
    output.write(`Unknown OAuth provider: ${selectedProvider}\n`);
    output.write(formatProviderList(providers));
    return 1;
  }

  const rl = createInterface({ input, output });
  try {
    output.write(`Logging in to ${selectedProvider}...\n`);
    await authStorage.login(selectedProvider, {
      onAuth: (info) => {
        output.write(`\nOpen this URL in your browser:\n${info.url}\n`);
        if (info.instructions) output.write(`${info.instructions}\n`);
        output.write("\n");
      },
      onPrompt: (prompt) => ask(rl, `${prompt.message}${prompt.placeholder ? ` (${prompt.placeholder})` : ""}: `),
      onManualCodeInput: () => ask(rl, "Paste redirect URL or code: "),
      onProgress: (message) => output.write(`${message}\n`),
      onSelect: async (prompt) => selectOption({ prompt, rl, output }),
    });
    output.write(`\nCredentials saved to ${authPath}\n`);
    return 0;
  } finally {
    rl.close();
  }
}

export function formatProviderList(providers) {
  if (!providers.length) return "No OAuth providers are available.\n";
  const lines = ["Available OAuth providers:"];
  for (const provider of providers) {
    lines.push(`  ${provider.id.padEnd(20)} ${provider.name}`);
  }
  return `${lines.join("\n")}\n`;
}

async function selectProvider({ providers, input, output }) {
  if (providers.length === 1) return providers[0].id;
  output.write(`${formatProviderList(providers)}\n`);
  const rl = createInterface({ input, output });
  try {
    const answer = await ask(rl, `Enter provider id or number (1-${providers.length}): `);
    return resolveSelection(answer, providers.map((provider) => ({ id: provider.id, label: provider.name })));
  } finally {
    rl.close();
  }
}

async function selectOption({ prompt, rl, output }) {
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
