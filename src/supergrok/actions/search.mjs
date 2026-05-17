import { DEFAULT_SUPERGROK_SEARCH_MODEL } from "../constants.mjs";
import { extractInlineCitations, extractResponseText, readErrorMessage, successEnvelope } from "../response.mjs";

const MAX_DOMAINS = 5;
const MAX_HANDLES = 10;

export async function runSuperGrokSearch({ action, query, options = {}, credentials, fetchImpl = fetch } = {}) {
  const model = String(options.model || DEFAULT_SUPERGROK_SEARCH_MODEL).trim() || DEFAULT_SUPERGROK_SEARCH_MODEL;
  const tool = action === "x_search" ? buildXSearchTool(options) : buildWebSearchTool(options);
  const response = await fetchImpl(`${credentials.baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "March-SuperGrok/0.1",
    },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: query }],
      tools: [tool],
      store: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`SuperGrok ${action} failed (${response.status}): ${await readErrorMessage(response)}`);
  }

  const payload = await response.json();
  return successEnvelope({
    credentialSource: credentials.credentialSource,
    action,
    model,
    query,
    answer: extractResponseText(payload),
    citations: payload.citations || [],
    inlineCitations: extractInlineCitations(payload),
  });
}

function buildWebSearchTool(options) {
  const allowed = normalizeList(options.allowed_domains, "allowed_domains", MAX_DOMAINS);
  const excluded = normalizeList(options.excluded_domains, "excluded_domains", MAX_DOMAINS);
  if (allowed.length && excluded.length) throw new Error("allowed_domains and excluded_domains cannot both be set");
  const tool = {
    type: "web_search",
    enable_image_understanding: options.enable_image_understanding ?? true,
  };
  if (allowed.length) tool.filters = { allowed_domains: allowed };
  if (excluded.length) tool.filters = { excluded_domains: excluded };
  return tool;
}

function buildXSearchTool(options) {
  const allowed = normalizeHandles(options.allowed_x_handles, "allowed_x_handles");
  const excluded = normalizeHandles(options.excluded_x_handles, "excluded_x_handles");
  if (allowed.length && excluded.length) throw new Error("allowed_x_handles and excluded_x_handles cannot both be set");
  const tool = {
    type: "x_search",
    enable_image_understanding: options.enable_image_understanding ?? true,
    enable_video_understanding: options.enable_video_understanding ?? true,
  };
  if (allowed.length) tool.allowed_x_handles = allowed;
  if (excluded.length) tool.excluded_x_handles = excluded;
  if (String(options.from_date || "").trim()) tool.from_date = String(options.from_date).trim();
  if (String(options.to_date || "").trim()) tool.to_date = String(options.to_date).trim();
  return tool;
}

function normalizeHandles(value, fieldName) {
  return normalizeList(value, fieldName, MAX_HANDLES).map((handle) => handle.replace(/^@+/, "")).filter(Boolean);
}

function normalizeList(value, fieldName, max) {
  const list = Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
  if (list.length > max) throw new Error(`${fieldName} supports at most ${max} entries`);
  return list;
}
