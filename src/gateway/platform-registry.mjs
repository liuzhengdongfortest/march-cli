export class GatewayPlatformRegistry {
  #factories = new Map();

  register(id, factory) {
    const key = normalizePlatformId(id);
    if (typeof factory !== "function") throw new Error(`Gateway platform factory must be a function: ${key}`);
    this.#factories.set(key, factory);
  }

  has(id) {
    return this.#factories.has(normalizePlatformId(id));
  }

  list() {
    return [...this.#factories.keys()].sort();
  }

  create(id, options = {}) {
    const key = normalizePlatformId(id);
    const factory = this.#factories.get(key);
    if (!factory) throw new Error(`Unsupported gateway platform: ${key}`);
    return factory(options);
  }
}

export function createDefaultGatewayPlatformRegistry() {
  return new GatewayPlatformRegistry();
}

function normalizePlatformId(id) {
  const value = String(id ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(value)) throw new Error(`Invalid gateway platform id: ${id}`);
  return value;
}
