import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../agent/tool-result.mjs";
import { resolveSuperGrokCredentials } from "./auth.mjs";
import { runSuperGrokImageGenerate } from "./actions/image-generate.mjs";
import { runSuperGrokSearch } from "./actions/search.mjs";
import { errorEnvelope } from "./response.mjs";

const ACTIONS = ["web_search", "x_search", "image_generate"];

export function createSuperGrokTool({ authStorage, projectMarchDir, resolveCredentials = resolveSuperGrokCredentials, fetchImpl = fetch } = {}) {
  return defineTool({
    name: "supergrok",
    label: "SuperGrok",
    description:
      "Use SuperGrok capabilities through xAI: realtime web search, X/Twitter search, and Grok image generation. " +
      "Default search behavior is broad and enables image/video understanding where supported. Requires SuperGrok OAuth or XAI_API_KEY.",
    promptSnippet: "supergrok(action, query, options?) - Use SuperGrok web_search, x_search, or image_generate",
    promptGuidelines: [
      "Use action=web_search for current web/news/documentation facts.",
      "Use action=x_search for current X/Twitter posts, reactions, profiles, and threads.",
      "Use action=image_generate when the user asks Grok/SuperGrok to create an image.",
      "Do not add domain, handle, or date filters unless the user asks for that narrower scope.",
    ],
    parameters: Type.Object({
      action: Type.String({ enum: ACTIONS, description: "SuperGrok capability to invoke" }),
      query: Type.String({ description: "Search query or image prompt" }),
      options: Type.Optional(Type.Object({}, { additionalProperties: true, description: "Action-specific optional controls" })),
    }),
    execute: async (_toolCallId, params) => {
      const action = params.action;
      const query = String(params.query || "").trim();
      const options = params.options && typeof params.options === "object" ? params.options : {};
      if (!ACTIONS.includes(action)) return toolJson(errorEnvelope({ action, query, error: `Unsupported SuperGrok action: ${action}`, errorType: "invalid_action" }), { error: true });
      if (!query) return toolJson(errorEnvelope({ action, query, error: "query is required", errorType: "invalid_request" }), { error: true });

      let credentials;
      try {
        credentials = await resolveCredentials({ authStorage });
        const payload = action === "image_generate"
          ? await runSuperGrokImageGenerate({ query, options, credentials, projectMarchDir, fetchImpl })
          : await runSuperGrokSearch({ action, query, options, credentials, fetchImpl });
        return toolJson(payload, payload);
      } catch (err) {
        const payload = errorEnvelope({
          credentialSource: credentials?.credentialSource ?? null,
          action,
          model: options.model ?? null,
          query,
          error: err.message,
          errorType: err.name || "error",
        });
        return toolJson(payload, { ...payload, error: true });
      }
    },
  });
}

function toolJson(payload, details = {}) {
  return toolText(JSON.stringify(payload, null, 2), details);
}
