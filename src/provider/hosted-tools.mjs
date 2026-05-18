const OPENAI_PROVIDERS = new Set(["openai", "openai-codex"]);
const XAI_PROVIDERS = new Set(["xai", "supergrok-oauth", "xai-oauth"]);

export function injectHostedTools(payload, model, config = {}) {
  const tools = resolveHostedTools(model, config);
  if (tools.length === 0) return payload;
  return appendPayloadTools(payload, tools);
}

export function resolveHostedTools(model, config = {}) {
  const capabilities = resolveHostedToolCapabilities(model);
  return capabilities.filter((tool) => isToolEnabled(tool, config)).map(createHostedTool);
}

export function resolveHostedToolCapabilities(model) {
  if (!model || typeof model !== "object") return [];
  if (OPENAI_PROVIDERS.has(model.provider) && isOpenAiResponsesApi(model.api)) {
    return ["openai.webSearch"];
  }
  if (XAI_PROVIDERS.has(model.provider) && model.api === "openai-responses") {
    return ["xai.webSearch", "xai.xSearch"];
  }
  return [];
}

function isToolEnabled(tool, config) {
  const [provider, name] = tool.split(".");
  const value = config?.[provider]?.[name] ?? "auto";
  return value !== false;
}

function createHostedTool(tool) {
  if (tool === "openai.webSearch") return { type: "web_search_preview" };
  if (tool === "xai.webSearch") return { type: "web_search", enable_image_understanding: true };
  if (tool === "xai.xSearch") {
    return { type: "x_search", enable_image_understanding: true, enable_video_understanding: true };
  }
  throw new Error(`Unsupported hosted tool capability: ${tool}`);
}

function isOpenAiResponsesApi(api) {
  return api === "openai-responses" || api === "openai-codex-responses";
}

function appendPayloadTools(payload, tools) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload.body && typeof payload.body === "object") {
    return { ...payload, body: appendPayloadTools(payload.body, tools) };
  }
  if (typeof payload.body === "string") return appendStringBodyTools(payload, tools);
  if (!Array.isArray(payload.tools)) return { ...payload, tools };
  return { ...payload, tools: mergeTools(payload.tools, tools) };
}

function appendStringBodyTools(payload, tools) {
  try {
    const body = JSON.parse(payload.body);
    return { ...payload, body: JSON.stringify(appendPayloadTools(body, tools)) };
  } catch {
    return payload;
  }
}

function mergeTools(existing, added) {
  const types = new Set(existing.map((tool) => tool?.type).filter(Boolean));
  return [...existing, ...added.filter((tool) => !types.has(tool.type))];
}
