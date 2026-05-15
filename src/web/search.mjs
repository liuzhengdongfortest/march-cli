/**
 * Web search tool — supports tavily and brave search APIs.
 * Falls back gracefully if no API key is configured.
 */

const TAVILY_API = "https://api.tavily.com/search";

export async function tavilySearch(query, apiKey, { maxResults = 5, searchDepth = "basic" } = {}) {
  if (!apiKey) throw new Error("TAVILY_API_KEY not configured");

  const res = await fetch(TAVILY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: searchDepth,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Tavily search failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.content ?? "",
    score: r.score ?? null,
  }));
}

const BRAVE_API = "https://api.search.brave.com/res/v1/web/search";

export async function braveSearch(query, apiKey, { maxResults = 5 } = {}) {
  if (!apiKey) throw new Error("BRAVE_API_KEY not configured");

  const res = await fetch(`${BRAVE_API}?q=${encodeURIComponent(query)}&count=${maxResults}`, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brave search failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.web?.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.description ?? "",
  }));
}

/**
 * Try available search providers in order.
 * Returns { results, provider } or throws if none are configured.
 */
export async function searchWeb(query, { tavilyKey, braveKey, maxResults = 5 } = {}) {
  if (tavilyKey) {
    try {
      const results = await tavilySearch(query, tavilyKey, { maxResults });
      return { results, provider: "tavily" };
    } catch (err) {
      // Fall through to next provider
      if (!braveKey) throw err;
    }
  }

  if (braveKey) {
    const results = await braveSearch(query, braveKey, { maxResults });
    return { results, provider: "brave" };
  }

  throw new Error("No search API key configured. Run: march websearch --config");
}
