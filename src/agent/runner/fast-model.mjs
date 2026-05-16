const FAST_PROVIDERS = new Set(["openai", "openai-codex"]);
const FAST_ID_SUFFIX = "__fast";

export function isFastProvider(provider) {
  return FAST_PROVIDERS.has(provider);
}

export function createFastModelEntry(baseModel) {
  return {
    model: {
      ...baseModel,
      id: baseModel.id + FAST_ID_SUFFIX,
      name: baseModel.name + " Fast",
      __isFast: true,
      __baseId: baseModel.id,
    },
  };
}

export function appendFastVariants(scopedModels) {
  const result = [];
  for (const entry of scopedModels) {
    result.push(entry);
    if (isFastProvider(entry.model.provider)) {
      result.push(createFastModelEntry(entry.model));
    }
  }
  return result;
}

export function fromFastEntryModel(model) {
  if (model.__isFast) {
    return { baseId: model.__baseId, isFast: true };
  }
  return { baseId: model.id, isFast: false };
}
