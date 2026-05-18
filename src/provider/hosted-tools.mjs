const OPENAI_PROVIDERS = new Set(["openai"]);
const AZURE_OPENAI_PROVIDERS = new Set(["azure-openai-responses"]);
const ANTHROPIC_PROVIDERS = new Set(["anthropic"]);
const GOOGLE_PROVIDERS = new Set(["google", "google-vertex"]);
const XAI_PROVIDERS = new Set(["xai", "supergrok-oauth", "xai-oauth"]);

export function injectHostedTools(payload, model, config = {}) {
  const capabilities = resolveHostedToolCapabilities(model).filter((tool) => isToolEnabled(tool, config));
  if (capabilities.length === 0) return payload;
  return injectPayloadHostedTools(payload, capabilities);
}

export function resolveHostedTools(model, config = {}) {
  return resolveHostedToolCapabilities(model).filter((tool) => isToolEnabled(tool, config)).map(createHostedTool);
}

export function resolveHostedToolCapabilities(model) {
  if (!model || typeof model !== "object") return [];
  if (OPENAI_PROVIDERS.has(model.provider) && isOpenAiResponsesApi(model.api)) return ["openai.webSearch"];
  if (AZURE_OPENAI_PROVIDERS.has(model.provider) && model.api === "azure-openai-responses") {
    return ["azureOpenai.webSearch"];
  }
  if (ANTHROPIC_PROVIDERS.has(model.provider) && model.api === "anthropic-messages") return ["anthropic.webSearch"];
  if (GOOGLE_PROVIDERS.has(model.provider) && isGoogleApi(model.api)) return ["google.webSearch"];
  if (XAI_PROVIDERS.has(model.provider) && model.api === "openai-responses") return ["xai.webSearch", "xai.xSearch"];
  return [];
}

function isToolEnabled(tool, config) {
  const [provider, name] = tool.split(".");
  const value = config?.[provider]?.[name] ?? "auto";
  return value !== false;
}

function createHostedTool(tool) {
  if (tool === "openai.webSearch" || tool === "azureOpenai.webSearch") return { type: "web_search_preview" };
  if (tool === "anthropic.webSearch") return { type: "web_search_20250305", name: "web_search" };
  if (tool === "google.webSearch") return { googleSearch: {} };
  if (tool === "xai.webSearch") return { type: "web_search", enable_image_understanding: true };
  if (tool === "xai.xSearch") {
    return { type: "x_search", enable_image_understanding: true, enable_video_understanding: true };
  }
  throw new Error(`Unsupported hosted tool capability: ${tool}`);
}

function isOpenAiResponsesApi(api) {
  return api === "openai-responses";
}

function isGoogleApi(api) {
  return api === "google-generative-ai" || api === "google-vertex";
}

function injectPayloadHostedTools(payload, capabilities) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload.body && typeof payload.body === "object") {
    return { ...payload, body: injectPayloadHostedTools(payload.body, capabilities) };
  }
  if (typeof payload.body === "string") return injectStringBodyHostedTools(payload, capabilities);
  return capabilities.reduce((next, capability) => injectPayloadHostedTool(next, capability), payload);
}

function injectPayloadHostedTool(payload, capability) {
  if (capability.startsWith("google.")) return appendGoogleTool(payload, createHostedTool(capability));
  return appendTopLevelTool(payload, createHostedTool(capability));
}

function injectStringBodyHostedTools(payload, capabilities) {
  try {
    const body = JSON.parse(payload.body);
    return { ...payload, body: JSON.stringify(injectPayloadHostedTools(body, capabilities)) };
  } catch {
    return payload;
  }
}

function appendTopLevelTool(payload, tool) {
  if (!Array.isArray(payload.tools)) return { ...payload, tools: [tool] };
  return { ...payload, tools: mergeTools(payload.tools, [tool], getToolKey) };
}

function appendGoogleTool(payload, tool) {
  const config = payload.config && typeof payload.config === "object" ? payload.config : {};
  const tools = Array.isArray(config.tools) ? config.tools : [];
  return {
    ...payload,
    config: {
      ...config,
      tools: mergeTools(tools, [tool], getGoogleToolKey),
    },
  };
}

function mergeTools(existing, added, keyForTool) {
  const keys = new Set(existing.map(keyForTool).filter(Boolean));
  return [...existing, ...added.filter((tool) => !keys.has(keyForTool(tool)))];
}

function getToolKey(tool) {
  return tool?.type ?? tool?.name;
}

function getGoogleToolKey(tool) {
  if (tool?.googleSearch) return "googleSearch";
  return tool?.functionDeclarations ? "functionDeclarations" : getToolKey(tool);
}
