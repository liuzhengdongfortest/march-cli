import { globalConfigJsonPath, readConfigJson } from "../config/config-json.mjs";
import { selectWithKeyboard } from "../cli/input/select-with-keyboard.mjs";
import { cloneProviderForShare, createProviderShareToken, hasApiKey } from "./share-payload.mjs";

export async function runProviderShareCommand({
  homeDir,
  providerId,
  includeKey = false,
  profileOnly = false,
  input = process.stdin,
  output = process.stdout,
  select = selectWithKeyboard,
} = {}) {
  if (includeKey && profileOnly) {
    output.write("Choose either --include-key or --profile-only, not both.\n");
    return 1;
  }

  const config = readConfigJson(globalConfigJsonPath(homeDir));
  const providers = normalizeProviders(config.providers);
  const selectedProviderId = providerId ?? await selectProvider({ providers, input, output, select });
  if (!selectedProviderId) {
    output.write(Object.keys(providers).length ? "Provider share cancelled.\n" : "No providers configured. Run: march provider --config\n");
    return 1;
  }

  const provider = providers[selectedProviderId];
  if (!provider) {
    output.write(`Provider not found: ${selectedProviderId}\n`);
    return 1;
  }

  const includeApiKey = includeKey || (!profileOnly && await selectShareMode({ input, output, select }));
  const sharedProvider = cloneProviderForShare(provider, { includeApiKey });
  const token = createProviderShareToken({
    providerId: selectedProviderId,
    provider: sharedProvider,
    mode: includeApiKey ? "full" : "profile-only",
  });

  output.write(`Provider: ${selectedProviderId}\n`);
  output.write(`Mode: ${includeApiKey ? "Full config, including API key" : "Profile only, without API key"}\n`);
  output.write(`API key: ${hasApiKey(sharedProvider) ? "included" : "not included"}\n\n`);
  output.write(`march provider accept ${token}\n`);
  return 0;
}

function normalizeProviders(providers) {
  return providers && typeof providers === "object" && !Array.isArray(providers) ? providers : {};
}

async function selectProvider({ providers, input, output, select }) {
  const items = Object.entries(providers).map(([id, provider]) => ({
    value: id,
    label: formatProviderLabel(id, provider),
  }));
  return await select({ input, output, message: "Choose provider to share", items });
}

async function selectShareMode({ input, output, select }) {
  const mode = await select({
    input,
    output,
    message: "Choose share mode",
    items: [
      { label: "Full config, including API key", value: "full" },
      { label: "Profile only, without API key", value: "profile-only" },
    ],
  });
  return mode === "full";
}

function formatProviderLabel(id, provider) {
  const name = typeof provider?.name === "string" && provider.name ? provider.name : "-";
  const type = typeof provider?.type === "string" && provider.type ? provider.type : "unknown";
  const modelCount = Array.isArray(provider?.models) ? `${provider.models.length} model${provider.models.length === 1 ? "" : "s"}` : "built-in";
  const key = hasApiKey(provider) ? "API key configured" : "no API key";
  return `${id}  ${name}  ${type}  ${modelCount}  ${key}`;
}
