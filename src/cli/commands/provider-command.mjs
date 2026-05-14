import { getProviderLabel } from "../../provider/presets.mjs";

export function parseProviderCommand(input) {
  if (input !== "/providers" && !input.startsWith("/providers ")) {
    return { type: "none" };
  }
  const arg = input.slice("/providers".length).trim();
  if (!arg) return { type: "list" };
  return { type: "error", message: "Provider switching is done by choosing a model with Ctrl+L or /model." };
}

export function listProviders({ runner }) {
  const scopedModels = runner.getScopedModels?.() || [];
  const providers = new Map();
  for (const { model } of scopedModels) {
    if (!providers.has(model.provider)) {
      providers.set(model.provider, {
        provider: model.provider,
        modelCount: 0,
        defaultModel: model.id,
      });
    }
    const entry = providers.get(model.provider);
    entry.modelCount += 1;
  }
  return [...providers.values()].sort((a, b) => a.provider.localeCompare(b.provider));
}

export function formatProvidersList({ currentProvider, providers = [] }) {
  if (providers.length === 0) return ["(no providers available)"];
  return providers.map(({ provider, modelCount }) => {
    const marker = provider === currentProvider ? "●" : "○";
    return `${marker} ${provider} (${modelCount} model${modelCount === 1 ? "" : "s"})`;
  });
}

export async function handleProviderCommand(parsed, { ui, runner }) {
  if (parsed.type === "list") {
    const configured = runner.getConfiguredProviders?.() ?? [];
    if (configured.length === 0) {
      return [
        "Configured providers: (none)",
        "Run `march provider --config` outside REPL to add credentials.",
      ].join("\n");
    }
    return [
      "Configured providers:",
      ...configured.map((provider) => `  ${getProviderLabel(provider)}`),
      "Use Ctrl+L or /model to choose a model.",
      "Run `march provider --config` outside REPL to add/update credentials.",
    ].join("\n");
  }
  if (parsed.type === "error") return `Error: ${parsed.message}`;
  return "";
}
