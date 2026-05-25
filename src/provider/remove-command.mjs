import { createInterface } from "node:readline";
import { AuthStorage } from "@earendil-works/pi-coding-agent";
import { globalConfigJsonPath, readConfigJson, removeProviderProfile } from "../config/config-json.mjs";
import { getMarchAuthPath } from "../auth/storage.mjs";
import { selectWithKeyboard } from "../cli/input/select-with-keyboard.mjs";
import { getProviderLabel } from "./presets.mjs";

export async function runProviderRemoveCommand({
  homeDir,
  providerId,
  input = process.stdin,
  output = process.stdout,
  select = selectWithKeyboard,
  confirm = confirmRemoval,
  authStorage = AuthStorage.create(getMarchAuthPath(homeDir)),
} = {}) {
  const removableProviders = listRemovableProviders({ homeDir, authStorage });
  const selectedProviderId = providerId ?? await selectProviderToRemove({ removableProviders, input, output, select });
  if (!selectedProviderId) {
    if (!removableProviders.length) {
      output.write("No configured providers to remove.\nRun `march provider --config` to add one.\n");
    } else {
      output.write("Provider removal cancelled.\n");
    }
    return 1;
  }

  const provider = removableProviders.find((item) => item.id === selectedProviderId) ?? {
    id: selectedProviderId,
    label: getProviderLabel(selectedProviderId),
    sources: [],
  };
  const confirmed = await confirm({ input, output, provider });
  if (!confirmed) {
    output.write("Provider removal cancelled.\n");
    return 1;
  }

  const configRemoved = removeProviderProfile({ path: globalConfigJsonPath(homeDir), id: selectedProviderId });
  const credentialRemoved = removeProviderCredential({ authStorage, id: selectedProviderId });
  if (!configRemoved && !credentialRemoved) {
    output.write(`Provider not found: ${selectedProviderId}\n`);
    return 1;
  }

  output.write(`Removed provider: ${provider.label} (${selectedProviderId})\n`);
  return 0;
}

export function listRemovableProviders({ homeDir, authStorage }) {
  const config = readConfigJson(globalConfigJsonPath(homeDir));
  const providers = config.providers && typeof config.providers === "object" && !Array.isArray(config.providers)
    ? config.providers
    : {};
  const ids = new Set(Object.keys(providers));
  for (const id of safeListAuthProviders(authStorage)) ids.add(id);
  return [...ids].sort((a, b) => getProviderLabel(a).localeCompare(getProviderLabel(b))).map((id) => {
    const sources = [];
    if (Object.prototype.hasOwnProperty.call(providers, id)) sources.push("config");
    if (safeHasAuthProvider(authStorage, id)) sources.push("credential");
    return {
      id,
      label: getProviderLabel(id),
      sources,
    };
  });
}

async function selectProviderToRemove({ removableProviders, input, output, select }) {
  if (!removableProviders.length) return null;
  return await select({
    input,
    output,
    message: "Select provider to remove",
    items: removableProviders.map((provider) => ({
      label: `${provider.label} (${provider.id})${formatSources(provider.sources)}`,
      value: provider.id,
    })),
  });
}

function removeProviderCredential({ authStorage, id }) {
  const existed = safeHasAuthProvider(authStorage, id);
  if (typeof authStorage.remove === "function") authStorage.remove(id);
  return existed;
}

function safeListAuthProviders(authStorage) {
  if (typeof authStorage.list !== "function") return [];
  try {
    const providers = authStorage.list();
    return Array.isArray(providers) ? providers.filter((id) => typeof id === "string" && id) : [];
  } catch {
    return [];
  }
}

function safeHasAuthProvider(authStorage, id) {
  if (typeof authStorage.get === "function") {
    try {
      return authStorage.get(id) != null;
    } catch {
      return false;
    }
  }
  return safeListAuthProviders(authStorage).includes(id);
}

function formatSources(sources) {
  if (!sources.length) return "";
  return ` — ${sources.join(" + ")}`;
}

async function confirmRemoval({ input, output, provider }) {
  const answer = String(await readLine({
    input,
    output,
    prompt: `Remove provider "${provider.label}" (${provider.id})? This deletes local config and credentials. [y/N] `,
  }) ?? "").trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

function readLine({ input = process.stdin, output = process.stdout, prompt }) {
  const rl = createInterface({ input, output });
  return new Promise((resolve) => rl.question(prompt, (answer) => {
    rl.close();
    resolve(answer);
  }));
}
