export function modelSupportsImageInput(model) {
  if (!model || typeof model !== "object") return false;
  if (Array.isArray(model.input) && model.input.includes("image")) return true;
  if (model.capabilities?.images === true || model.capabilities?.vision === true) return true;
  return false;
}

export function currentModelImageInputError(getCurrentModel) {
  if (typeof getCurrentModel !== "function") return null;
  const model = getCurrentModel();
  if (modelSupportsImageInput(model)) return null;
  const label = model ? `${model.name || model.id || "unknown"} (${model.provider || "unknown provider"})` : "unknown";
  return `Current model does not support image input: ${label}. Switch to a vision-capable model before using read_image or screen.`;
}
