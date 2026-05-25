import { HashingVectorizer } from "./vector.mjs";

export class ResilientVectorizer {
  constructor({ primary, fallback = new HashingVectorizer(), label = "embedding" } = {}) {
    if (!primary) throw new Error("ResilientVectorizer requires primary");
    this.primary = primary;
    this.fallback = fallback;
    this.label = label;
    this.id = `resilient:${primary.id}->${fallback.id}`;
    this.active = primary;
    this.status = "primary";
    this.warning = null;
  }

  get dimensions() {
    return this.active.dimensions;
  }

  get activeId() {
    return this.active.id;
  }

  async load() {
    if (this.status === "fallback") return false;
    try {
      if (typeof this.primary.load === "function") await this.primary.load();
      else await this.primary.encode([`${this.label} warmup`]);
      return true;
    } catch (err) {
      this.#activateFallback(err);
      return false;
    }
  }

  async encode(texts) {
    if (this.status === "fallback") return this.fallback.encode(texts);
    try {
      return await this.primary.encode(texts);
    } catch (err) {
      this.#activateFallback(err);
      return this.fallback.encode(texts);
    }
  }

  #activateFallback(err) {
    this.active = this.fallback;
    this.status = "fallback";
    const message = err?.message ?? String(err);
    this.warning = `${this.label} Model2Vec unavailable; using local hashing fallback: ${message}`;
  }
}

export function describeVectorizer(vectorizer) {
  return {
    vectorizer: vectorizer?.activeId ?? vectorizer?.id ?? "unknown",
    vectorizer_status: vectorizer?.status ?? "primary",
    vectorizer_warning: vectorizer?.warning ?? null,
  };
}
