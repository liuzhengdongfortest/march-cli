import { getProviderLabel } from "../../provider/presets.mjs";
import { globalConfigJsonPath, upsertModelSelection } from "../../config/config-json.mjs";

// Deduplicate models by id, preferring canonical providers.
// When the same model id appears under multiple providers (e.g. supergrok-oauth
// and xai-oauth), keep only the entry with the preferred provider.
const PREFERRED_PROVIDERS = ["supergrok-oauth"];

function dedupByModelId(scopedModels) {
  const seen = new Map();
  const result = [];
  for (const entry of scopedModels) {
    const { model } = entry;
    const existing = seen.get(model.id);
    if (!existing) {
      seen.set(model.id, entry);
      result.push(entry);
    } else {
      // Prefer canonical provider when duplicates exist
      const existingPref = PREFERRED_PROVIDERS.indexOf(existing.model.provider);
      const currentPref = PREFERRED_PROVIDERS.indexOf(model.provider);
      if (currentPref !== -1 && (existingPref === -1 || currentPref < existingPref)) {
        const idx = result.indexOf(existing);
        result[idx] = entry;
        seen.set(model.id, entry);
      }
    }
  }
  return result;
}

export function parseModelCommand(input) {
  if (input !== "/model" && !input.startsWith("/model ")) {
    return { type: "none" };
  }
  const arg = input.slice("/model".length).trim();
  if (!arg) return { type: "select-interactive" };
  return { type: "error", message: "Use /model without arguments or Ctrl+L to choose a model." };
}

export async function selectModelByIndex(index, { runner }) {
  const scopedModels = runner.getScopedModels?.() || [];
  if (scopedModels.length === 0) return "(no available models - run `march provider --config`)";
  const selected = scopedModels[index - 1];
  if (!selected) return `Error: model index out of range: ${index}`;
  await runner.setModel(selected.model);
  const name = selected.model.name || selected.model.id;
  return `Model: ${name} (${selected.model.provider})`;
}

export function buildModelSelectItems({ current, scopedModels = [] }) {
  const deduped = dedupByModelId(scopedModels);
  return deduped.map(({ model }, index) => ({
    value: String(index),
    label: `${model.name || model.id} (${getProviderLabel(model.provider)})`,
    description: current && model.id === current.id && model.provider === current.provider ? "current" : model.provider,
    model,
  }));
}

export async function handleModelCommand(parsed, { runner, ui = null, configHomeDir } = {}) {
  if (parsed.type === "select-interactive") {
    const scopedModels = runner.getScopedModels?.() || [];
    if (!ui?.selectList || scopedModels.length === 0) return "Use Ctrl+L to choose a model.";
    const current = runner.getCurrentModel?.();
    const items = buildModelSelectItems({ current, scopedModels });
    const selectedIndex = Math.max(0, items.findIndex((item) =>
      current && item.model.id === current.id && item.model.provider === current.provider
    ));
    const selectedItem = await ui.selectList({
      items,
      selectedIndex,
      width: 72,
      suppressInitialConfirm: true,
      searchable: true,
      getSearchText: modelSelectSearchText,
    });
    if (!selectedItem) return "Model unchanged.";
    const model = await runner.setModel(selectedItem.model);
    persistModelSelection(model, { configHomeDir });
    return `Model: ${model.name || model.id} (${model.provider})`;
  }
  if (parsed.type === "select") return selectModelByIndex(parsed.index, { runner });
  if (parsed.type === "error") return `Error: ${parsed.message}`;
  return "";
}

function modelSelectSearchText(item) {
  const model = item?.model;
  return `${item?.label ?? ""} ${model?.name ?? ""} ${model?.id ?? ""} ${model?.provider ?? ""}`;
}

export function persistModelSelection(model, { configHomeDir } = {}) {
  if (!model?.provider || !model?.id) return null;
  return upsertModelSelection({
    path: globalConfigJsonPath(configHomeDir),
    provider: model.provider,
    model: model.__isFast ? model.__baseId : model.id,
    serviceTier: model.__isFast ? "priority" : undefined,
  });
}

export function formatModelsList({ current, scopedModels = [] }) {
  const lines = [];
  if (current) {
    lines.push(`Current: ${current.name || current.id} (${current.provider})`);
  }
  if (scopedModels.length === 0) {
    lines.push("(no available models - run `march provider --config`)");
    return lines;
  }
  lines.push(...formatGroupedModels({ current, scopedModels }));
  lines.push("Use Ctrl+L or /model to choose a model.");
  return lines;
}

function formatGroupedModels({ current, scopedModels }) {
  const deduped = dedupByModelId(scopedModels);
  const groups = new Map();
  for (const item of deduped) {
    const provider = item.model.provider;
    if (!groups.has(provider)) groups.set(provider, []);
    groups.get(provider).push(item);
  }
  const lines = [];
  for (const [provider, items] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`── ${getProviderLabel(provider)} ──`);
    for (const { model } of items) {
      const marker = current && model.id === current.id && model.provider === current.provider ? "●" : " ";
      lines.push(`  ${marker} ${model.name || model.id}`);
    }
  }
  return lines;
}

export function listModels({ runner }) {
  return formatModelsList({
    current: runner.getCurrentModel?.(),
    scopedModels: runner.getScopedModels?.() || [],
  });
}
