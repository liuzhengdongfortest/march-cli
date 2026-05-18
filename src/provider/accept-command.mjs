import { globalConfigJsonPath, readConfigJson, upsertSharedProviderProfile } from "../config/config-json.mjs";
import { selectWithKeyboard } from "../cli/input/select-with-keyboard.mjs";
import { hasApiKey, parseProviderShareToken } from "./share-payload.mjs";

export async function runProviderAcceptCommand({
  homeDir,
  token,
  input = process.stdin,
  output = process.stdout,
  select = selectWithKeyboard,
} = {}) {
  if (!token) {
    output.write("Usage: march provider accept <march-provider-v1-token>\n");
    return 1;
  }

  let payload;
  try {
    payload = parseProviderShareToken(token);
  } catch (error) {
    output.write(`Invalid provider share token: ${error.message}\n`);
    return 1;
  }

  output.write(formatImportPreview(payload));
  const path = globalConfigJsonPath(homeDir);
  const config = readConfigJson(path);
  const providers = config.providers && typeof config.providers === "object" && !Array.isArray(config.providers) ? config.providers : {};
  if (providers[payload.providerId]) {
    const action = await select({
      input,
      output,
      message: `Provider "${payload.providerId}" already exists`,
      items: [
        { label: "Overwrite existing provider", value: "overwrite" },
        { label: "Cancel", value: "cancel" },
      ],
    });
    if (action !== "overwrite") {
      output.write("Provider import cancelled.\n");
      return 1;
    }
  } else {
    const action = await select({
      input,
      output,
      message: "Import provider?",
      items: [
        { label: "Import", value: "import" },
        { label: "Cancel", value: "cancel" },
      ],
    });
    if (action !== "import") {
      output.write("Provider import cancelled.\n");
      return 1;
    }
  }

  upsertSharedProviderProfile({ path, id: payload.providerId, provider: payload.provider });
  output.write(`Imported provider: ${payload.providerId}\n`);
  output.write(`Config: ${path}\n`);
  return 0;
}

export function formatImportPreview(payload) {
  const provider = payload.provider;
  const models = Array.isArray(provider.models) ? provider.models : [];
  const lines = [
    "Provider to import:",
    `  Id: ${payload.providerId}`,
    `  Name: ${typeof provider.name === "string" && provider.name ? provider.name : "-"}`,
    `  Type: ${provider.type}`,
  ];
  if (typeof provider.baseUrl === "string" && provider.baseUrl) lines.push(`  Base URL: ${provider.baseUrl}`);
  if (typeof provider.api === "string" && provider.api) lines.push(`  API: ${provider.api}`);
  if (models.length) {
    lines.push(`  Models: ${models.length}`);
    for (const model of models.slice(0, 5)) lines.push(`    - ${formatModel(model)}`);
    if (models.length > 5) lines.push(`    ... ${models.length - 5} more`);
  }
  lines.push(`  API key: ${hasApiKey(provider) ? "included" : "not included"}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function formatModel(model) {
  if (model && typeof model === "object" && !Array.isArray(model)) return model.name || model.id || "<unnamed>";
  return String(model);
}
