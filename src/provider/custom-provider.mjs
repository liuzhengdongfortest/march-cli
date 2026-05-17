const CUSTOM_PROVIDER_TYPE = "openai-compatible";
const DEFAULT_API = "openai-completions";
const SUPPORTED_APIS = new Set(["openai-completions", "openai-responses"]);
const DEFAULT_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export function registerCustomProviders(modelRegistry, providers = {}) {
  if (!modelRegistry?.registerProvider) return [];
  const registered = [];

  for (const [providerId, profile] of Object.entries(providers ?? {})) {
    if (!isCustomProviderProfile(profile)) continue;
    modelRegistry.registerProvider(providerId, toProviderConfig(providerId, profile));
    registered.push(providerId);
  }

  return registered;
}

export function isCustomProviderProfile(profile) {
  return Boolean(profile && typeof profile === "object" && profile.type === CUSTOM_PROVIDER_TYPE);
}

function toProviderConfig(providerId, profile) {
  const api = normalizeApi(providerId, profile.api ?? DEFAULT_API);
  const baseUrl = requireString(providerId, "baseUrl", profile.baseUrl);
  const models = normalizeModels(providerId, profile.models, { api, baseUrl });
  return omitUndefined({
    name: typeof profile.name === "string" && profile.name.trim() ? profile.name : providerId,
    baseUrl,
    apiKey: profile.auth?.method === "apiKey" ? profile.auth.apiKey : undefined,
    api,
    headers: normalizeHeaders(providerId, profile.headers),
    authHeader: typeof profile.authHeader === "boolean" ? profile.authHeader : undefined,
    models,
  });
}

function normalizeModels(providerId, models, { api, baseUrl }) {
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error(`Custom provider "${providerId}" requires a non-empty models array`);
  }

  return models.map((model, index) => {
    if (!model || typeof model !== "object" || Array.isArray(model)) {
      throw new Error(`Custom provider "${providerId}" model #${index + 1} must be an object`);
    }
    const id = requireString(providerId, `models[${index}].id`, model.id);
    return omitUndefined({
      ...model,
      id,
      name: typeof model.name === "string" && model.name.trim() ? model.name : id,
      api: normalizeApi(providerId, model.api ?? api),
      baseUrl: typeof model.baseUrl === "string" && model.baseUrl.trim() ? model.baseUrl : baseUrl,
      reasoning: typeof model.reasoning === "boolean" ? model.reasoning : false,
      input: normalizeInput(model.input),
      cost: normalizeCost(model.cost),
      contextWindow: normalizePositiveNumber(model.contextWindow, 128000),
      maxTokens: normalizePositiveNumber(model.maxTokens, 4096),
      headers: normalizeHeaders(providerId, model.headers),
    });
  });
}

function normalizeApi(providerId, api) {
  if (typeof api !== "string" || !SUPPORTED_APIS.has(api)) {
    throw new Error(`Custom provider "${providerId}" api must be "openai-completions" or "openai-responses"`);
  }
  return api;
}

function requireString(providerId, field, value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Custom provider "${providerId}" requires ${field}`);
  }
  return value;
}

function normalizeInput(input) {
  if (!Array.isArray(input) || input.length === 0) return ["text"];
  const normalized = input.filter((item) => item === "text" || item === "image");
  return normalized.length > 0 ? normalized : ["text"];
}

function normalizeCost(cost) {
  if (!cost || typeof cost !== "object" || Array.isArray(cost)) return DEFAULT_COST;
  return {
    input: normalizeNumber(cost.input, 0),
    output: normalizeNumber(cost.output, 0),
    cacheRead: normalizeNumber(cost.cacheRead, 0),
    cacheWrite: normalizeNumber(cost.cacheWrite, 0),
  };
}

function normalizeHeaders(providerId, headers) {
  if (headers == null) return undefined;
  if (typeof headers !== "object" || Array.isArray(headers)) {
    throw new Error(`Custom provider "${providerId}" headers must be an object`);
  }
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => typeof value === "string"));
}

function normalizePositiveNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function omitUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
