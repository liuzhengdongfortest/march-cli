export async function cycleModel({ runner }) {
  const result = await runner.cycleModel();
  if (!result) return "(only one model available)";
  const name = result.model.name || result.model.id;
  return `Model: ${name} (${result.model.provider})  thinking: ${result.thinkingLevel}`;
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
  for (const scoped of scopedModels) {
    const model = scoped.model;
    const name = model.name || model.id;
    const mark = current && model.id === current.id && model.provider === current.provider ? " *" : "  ";
    lines.push(`${mark} ${name} (${model.provider})`);
  }
  return lines;
}

export function listModels({ runner }) {
  return formatModelsList({
    current: runner.getCurrentModel?.(),
    scopedModels: runner.getScopedModels?.() || [],
  });
}
