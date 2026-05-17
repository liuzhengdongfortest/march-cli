import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";

export async function runSuperGrokToolSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: SuperGrok tool ---");
  const { XAI_OAUTH_CLIENT_ID } = await import("../src/supergrok/constants.mjs");
  const { createSuperGrokTool } = await import("../src/supergrok/tool.mjs");
  const { resolveSuperGrokCredentials } = await import("../src/supergrok/auth.mjs");
  const { AuthStorage } = await import("@earendil-works/pi-coding-agent");

  assert.equal(XAI_OAUTH_CLIENT_ID, "b1a00492-073a-47ea-816f-4c329264a828");

  await assert.rejects(
    () => resolveSuperGrokCredentials({ authStorage: { getApiKey: async () => "" } }),
    /No SuperGrok credentials/,
  );

  const oauthAuth = AuthStorage.inMemory({
    "supergrok-oauth": {
      type: "oauth",
      access: "oauth-token",
      refresh: "refresh-token",
      expires: Date.now() + 60_000,
      baseUrl: "https://api.x.ai/v1",
    },
  });
  oauthAuth.setRuntimeApiKey("xai", "raw-xai-key");
  const oauthCreds = await resolveSuperGrokCredentials({ authStorage: oauthAuth });
  assert.equal(oauthCreds.credentialSource, "supergrok-oauth");
  assert.equal(oauthCreds.apiKey, "oauth-token");

  const apiKeyAuth = AuthStorage.inMemory();
  apiKeyAuth.setRuntimeApiKey("xai", "raw-xai-key");
  const apiKeyCreds = await resolveSuperGrokCredentials({ authStorage: apiKeyAuth });
  assert.equal(apiKeyCreds.credentialSource, "xai");
  assert.equal(apiKeyCreds.apiKey, "raw-xai-key");

  const captured = [];
  const tool = createSuperGrokTool({
    projectMarchDir: join(setupTmp(), ".march"),
    resolveCredentials: async () => ({ credentialSource: "supergrok-oauth", apiKey: "oauth-token", baseUrl: "https://api.x.ai/v1" }),
    fetchImpl: async (url, init) => {
      captured.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({
        output_text: "Fresh answer from Grok.",
        citations: [{ url: "https://x.ai", title: "xAI" }],
      });
    },
  });

  const webResult = await tool.execute("tc-supergrok-web", { action: "web_search", query: "latest xAI news" });
  const webPayload = JSON.parse(webResult.content[0].text);
  assert.equal(webPayload.success, true);
  assert.equal(captured[0].url, "https://api.x.ai/v1/responses");
  assert.equal(captured[0].body.tools[0].type, "web_search");
  assert.equal(captured[0].body.tools[0].enable_image_understanding, true);
  assert.equal(captured[0].init.headers.Authorization, "Bearer oauth-token");

  const xResult = await tool.execute("tc-supergrok-x", { action: "x_search", query: "Grok reactions", options: { allowed_x_handles: ["@xai"] } });
  const xPayload = JSON.parse(xResult.content[0].text);
  assert.equal(xPayload.success, true);
  assert.equal(captured[1].body.tools[0].type, "x_search");
  assert.equal(captured[1].body.tools[0].allowed_x_handles[0], "xai");
  assert.equal(captured[1].body.tools[0].enable_video_understanding, true);

  const conflict = await tool.execute("tc-supergrok-conflict", {
    action: "x_search",
    query: "Grok",
    options: { allowed_x_handles: ["xai"], excluded_x_handles: ["grok"] },
  });
  assert.equal(JSON.parse(conflict.content[0].text).success, false);

  const dir = setupTmp();
  const imageTool = createSuperGrokTool({
    projectMarchDir: join(dir, ".march"),
    resolveCredentials: async () => ({ credentialSource: "supergrok-oauth", apiKey: "oauth-token", baseUrl: "https://api.x.ai/v1" }),
    fetchImpl: async (url, init) => {
      captured.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({ data: [{ b64_json: Buffer.from("png-data").toString("base64") }] });
    },
  });
  const imageResult = await imageTool.execute("tc-supergrok-image", { action: "image_generate", query: "a tiny robot" });
  const imagePayload = JSON.parse(imageResult.content[0].text);
  assert.equal(imagePayload.success, true);
  assert.equal(imagePayload.artifacts[0].type, "image");
  assert.ok(existsSync(imagePayload.artifacts[0].path));
  cleanup(dir);
  console.log("  PASS");
}

function jsonResponse(payload, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}
