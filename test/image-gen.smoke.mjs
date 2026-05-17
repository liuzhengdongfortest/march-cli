import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function runImageGenSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: image generation tool ---");
  const { generateImage } = await import("../src/image-gen/provider.mjs");
  const { createImageGenTool } = await import("../src/image-gen/tool.mjs");
  const { resolveImageAttachmentReferences } = await import("../src/session/attachment-references.mjs");

  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  const imageBase64 = Buffer.from([1, 2, 3, 4]).toString("base64");
  const token = fakeJwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct_1" } });
  const authStorage = {
    stored: { type: "oauth", expires: Date.now() + 60_000 },
    get(provider) {
      assert.equal(provider, "openai-codex");
      return this.stored;
    },
    set(provider, credentials) {
      this.stored = credentials;
    },
  };
  let requestBody = null;
  const fetchImpl = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return sseResponse([
      { type: "response.output_item.done", item: { type: "image_generation_call", result: imageBase64 } },
      { type: "response.completed", response: { output: [] } },
    ]);
  };

  try {
    const result = await generateImage({
      prompt: "draw a cat",
      quality: "medium",
      aspectRatio: "16:9",
      projectMarchDir,
      authStorage,
      fetchImpl,
      oauthProvider: {
        getApiKey: () => token,
        refreshToken: async (credentials) => credentials,
      },
      now: new Date("2026-05-10T00:00:03.000Z"),
      id: "img:1",
    });

    assert.equal(requestBody.input[0].type, "message");
    assert.equal(requestBody.tools[0].type, "image_generation");
    assert.equal(requestBody.tools[0].size, "1792x1024");
    assert.equal(requestBody.tools[0].output_format, "png");
    assert.deepEqual(requestBody.tool_choice.tools, [{ type: "image_generation" }]);
    assert.equal(result.marker, "@.march/attachments/generated/2026-05-10T00-00-03-000Z_img-1.png");
    assert.equal(existsSync(result.filePath), true);
    assert.deepEqual([...readFileSync(result.filePath)], [1, 2, 3, 4]);

    const resolved = resolveImageAttachmentReferences({ text: result.marker, projectMarchDir });
    assert.equal(resolved.images.length, 1);
    assert.equal(resolved.images[0].mimeType, "image/png");
    assert.equal(resolved.images[0].data, imageBase64);

    let openedPath = null;
    const tool = createImageGenTool({
      authStorage,
      projectMarchDir,
      generateImageImpl: async () => ({ filePath: result.filePath, marker: result.marker, mimeType: "image/png" }),
      openFileImpl: async (filePath) => {
        openedPath = filePath;
      },
    });
    const toolResult = await tool.execute("call_1", { prompt: "draw a cat", aspectRatio: "1:1" });
    const payload = JSON.parse(toolResult.content[0].text);
    assert.equal(payload.success, true);
    assert.equal(payload.image, result.marker);
    assert.equal(payload.path, result.filePath);
    assert.equal(payload.opened, true);
    assert.equal(openedPath, result.filePath);

    const noOpenResult = await tool.execute("call_2", { prompt: "draw a cat", auto_open: false });
    const noOpenPayload = JSON.parse(noOpenResult.content[0].text);
    assert.equal(noOpenPayload.success, true);
    assert.equal(noOpenPayload.opened, false);
  } finally {
    cleanup(dir);
  }
  console.log("  PASS");
}

function sseResponse(events) {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
  };
}

function fakeJwt(payload) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64")}.signature`;
}
