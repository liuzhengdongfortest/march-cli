export class RemoteMemoryClient {
  constructor({ name, url, token = null, fetchImpl = globalThis.fetch } = {}) {
    if (!name) throw new Error("RemoteMemoryClient requires a source name");
    if (!url) throw new Error("RemoteMemoryClient requires a URL");
    if (typeof fetchImpl !== "function") throw new Error("fetch is not available for remote memory");
    this.name = name;
    this.url = String(url).replace(/\/$/, "");
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async metadata() {
    return this.#request("GET", "/metadata");
  }

  async search({ query, limit, context, syntax, case: caseMode, glob } = {}) {
    const response = await this.#request("POST", "/search", {
      query,
      limit,
      context,
      syntax,
      case: caseMode,
      glob,
    });
    return normalizeResults(response.results ?? [], this.name);
  }

  async open({ path, line, context, offset, limit } = {}) {
    const response = await this.#request("POST", "/open", { path, line, context, offset, limit });
    return { ...response, source: this.name, readonly: true };
  }

  async #request(method, pathname, body = null) {
    const headers = { accept: "application/json" };
    if (body != null) headers["content-type"] = "application/json";
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const response = await this.fetchImpl(`${this.url}${pathname}`, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`remote memory ${this.name} returned non-JSON response`);
      }
    }
    if (!response.ok) {
      throw new Error(json?.error || `remote memory ${this.name} request failed: HTTP ${response.status}`);
    }
    return json ?? {};
  }
}

export function createRemoteMemoryClients(sources = [], options = {}) {
  return sources.map((source) => new RemoteMemoryClient({ ...source, ...options }));
}

function normalizeResults(results, source) {
  return results.map((result) => ({
    ...result,
    source,
    open: { source, path: result.path, line: result.line, context: result.open?.context ?? 40 },
  }));
}
