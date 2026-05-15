import { getProviderLabel } from "../../provider/presets.mjs";
import { globalConfigJsonPath, upsertModelSelection } from "../../config/config-json.mjs";

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
  return scopedModels.map(({ model }, index) => ({
    value: String(index),
    label: `${getProviderLabel(model.provider)} / ${model.name || model.id}`,
    description: current && model.id === current.id && model.provider === current.provider ? "current" : model.provider,
    model,
  }));
}

export async function handleModelCommand(parsed, { runner, ui = null, configHomeDir } = {}) {
  if (parsed.type === "select-interactive") {
    const scopedModels = runner.getScopedModels?.() || [];
    if (!ui?.selectList || scopedModels.length === 0) return "Use Ctrl+L to choose a model.";
    const current = runner.getCurrentModel?.();
    const selectedIndex = Math.max(0, scopedModels.findIndex(({ model }) =>
      current && model.id === current.id && model.provider === current.provider
    ));
    const item = await ui.selectList({
      items: buildModelSelectItems({ current, scopedModels }),
      selectedIndex,
      width: 72,
    });
    if (!item) return "Model unchanged.";
    const model = await runner.setModel(item.model);
    persistModelSelection(model, { configHomeDir });
    return `Model: ${model.name || model.id} (${model.provider})`;
  }
  if (parsed.type === "select") return selectModelByIndex(parsed.index, { runner });
  if (parsed.type === "error") return `Error: ${parsed.message}`;
  return "";
}

export function persistModelSelection(model, { configHomeDir } = {}) {
  if (!model?.provider || !model?.id) return null;
  return upsertModelSelection({
    path: globalConfigJsonPath(configHomeDir),
    provider: model.provider,
    model: model.id,
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
  const groups = new Map();
  for (const item of scopedModels) {
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
