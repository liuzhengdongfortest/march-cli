const KIND = "march.provider.share";
const VERSION = 1;
const PREFIX = "march-provider-v1.";

export function createProviderShareToken({ providerId, provider, mode }) {
  const payload = {
    kind: KIND,
    version: VERSION,
    mode,
    containsApiKey: hasApiKey(provider),
    providerId,
    provider,
  };
  return `${PREFIX}${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

export function parseProviderShareToken(token) {
  const text = String(token ?? "").trim();
  if (!text.startsWith(PREFIX)) throw new Error(`Provider share token must start with ${PREFIX}`);
  let payload;
  try {
    payload = JSON.parse(Buffer.from(text.slice(PREFIX.length), "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid provider share token");
  }
  validateProviderSharePayload(payload);
  return payload;
}

export function cloneProviderForShare(provider, { includeApiKey }) {
  const clone = structuredClone(provider);
  if (!includeApiKey && clone.auth && typeof clone.auth === "object" && !Array.isArray(clone.auth)) {
    delete clone.auth.apiKey;
  }
  return clone;
}

export function hasApiKey(provider) {
  return typeof provider?.auth?.apiKey === "string" && provider.auth.apiKey.length > 0;
}

export function validateProviderSharePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid provider share payload");
  if (payload.kind !== KIND || payload.version !== VERSION) throw new Error("Unsupported provider share token");
  if (typeof payload.providerId !== "string" || !payload.providerId.trim()) throw new Error("Provider share token is missing providerId");
  validateProviderProfile(payload.provider);
}

function validateProviderProfile(provider) {
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) throw new Error("Provider share token is missing provider config");
  if (typeof provider.type !== "string" || !provider.type.trim()) throw new Error("Provider config is missing type");
}
