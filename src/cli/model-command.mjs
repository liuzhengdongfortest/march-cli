export function parseModelCommand(input) {
  if (input !== "/model" && !input.startsWith("/model ")) {
    return { type: "none" };
  }
  const arg = input.slice("/model".length).trim();
  if (!arg) return { type: "cycle" };
  const index = Number(arg);
  if (Number.isInteger(index) && index > 0) return { type: "select", index };
  return { type: "error", message: "Usage: /model [index]" };
}

export async function cycleModel({ runner }) {
  const result = await runner.cycleModel();
  if (!result) return "(only one model available)";
  const name = result.model.name || result.model.id;
  return `Model: ${name} (${result.model.provider})  thinking: ${result.thinkingLevel}`;
}

export async function selectModelByIndex(index, { runner }) {
  const scopedModels = runner.getScopedModels?.() || [];
  if (scopedModels.length === 0) return "(no scoped models - use /model to cycle available models)";
  const selected = scopedModels[index - 1];
  if (!selected) return `Error: model index out of range: ${index}`;
  await runner.setModel(selected.model);
  const name = selected.model.name || selected.model.id;
  return `Model: ${name} (${selected.model.provider})`;
}

export async function handleModelCommand(parsed, { runner }) {
  if (parsed.type === "cycle") return cycleModel({ runner });
  if (parsed.type === "select") return selectModelByIndex(parsed.index, { runner });
  if (parsed.type === "error") return `Error: ${parsed.message}`;
  return "";
}

export function formatModelsList({ current, scopedModels = [] }) {
  const lines = [];
  if (current) {
    lines.push(`Current: ${current.name || current.id} (${current.provider})`);
  }
  if (scopedModels.length === 0) {
    lines.push("(no scoped models - use --model flag or /model to cycle)");
    return lines;
  }
  scopedModels.forEach((scoped, index) => {
    const model = scoped.model;
    const name = model.name || model.id;
    const mark = current && model.id === current.id && model.provider === current.provider ? " *" : "  ";
    lines.push(`${mark} ${index + 1}. ${name} (${model.provider})`);
  });
  lines.push("Use /model <index> to select.");
  return lines;
}

export function listModels({ runner }) {
  return formatModelsList({
    current: runner.getCurrentModel?.(),
    scopedModels: runner.getScopedModels?.() || [],
  });
}
