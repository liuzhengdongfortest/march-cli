export function parseProviderCommand(input) {
  if (input !== "/providers" && !input.startsWith("/providers ")) {
    return { type: "none" };
  }
  const arg = input.slice("/providers".length).trim();
  if (!arg) return { type: "list" };
  return { type: "select", provider: arg };
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
    const current = runner.getCurrentModel?.();
    const providers = listProviders({ runner });
    return formatProvidersList({
      currentProvider: current?.provider,
      providers,
    });
  }
  if (parsed.type === "select") {
    const scopedModels = runner.getScopedModels?.() || [];
    const match = scopedModels.find(({ model }) => model.provider === parsed.provider);
    if (!match) return `Error: provider not found: ${parsed.provider}`;
    await runner.setModel(match.model);
    return `Provider: ${match.model.provider}  Model: ${match.model.name || match.model.id}`;
  }
  return "";
}
