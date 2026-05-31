import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runImageGenSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: image generation tool ---");
  const { generateImage } = await import("../src/image-gen/provider.mjs");
  const { createImageGenTool } = await import("../src/image-gen/tool.mjs");
  const { resolveImageAttachmentReferences } = await import("../src/session/attachment-references.mjs");

  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  const imageBase64 = Buffer.from([1, 2, 3, 4]).toString("base64");
  const referenceBase64 = Buffer.from([5, 6, 7, 8]).toString("base64");
  const referencePath = join(dir, "reference.png");
  writeFileSync(referencePath, Buffer.from([5, 6, 7, 8]));
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
    assert.deepEqual(requestBody.input[0].content, [{ type: "input_text", text: "draw a cat" }]);
    assert.equal(requestBody.tools[0].type, "image_generation");
    assert.equal(requestBody.tools[0].size, "1792x1024");
    assert.equal(requestBody.tools[0].output_format, "png");
    assert.deepEqual(requestBody.tool_choice.tools, [{ type: "image_generation" }]);
    assert.equal(result.marker, "@.march/attachments/generated/2026-05-10T00-00-03-000Z_img-1.png");
    assert.equal(existsSync(result.filePath), true);
    assert.deepEqual([...readFileSync(result.filePath)], [1, 2, 3, 4]);

    const guidedResult = await generateImage({
      prompt: "draw a cat like the reference",
      referenceImages: [referencePath],
      projectMarchDir,
      authStorage,
      fetchImpl,
      oauthProvider: {
        getApiKey: () => token,
        refreshToken: async (credentials) => credentials,
      },
      now: new Date("2026-05-10T00:00:04.000Z"),
      id: "img:2",
    });

    assert.equal(guidedResult.marker, "@.march/attachments/generated/2026-05-10T00-00-04-000Z_img-2.png");
    assert.deepEqual(requestBody.input[0].content, [
      { type: "input_text", text: "draw a cat like the reference" },
      { type: "input_image", image_url: `data:image/png;base64,${referenceBase64}`, detail: "high" },
    ]);

    mkdirSync(join(projectMarchDir, "attachments", "session"), { recursive: true });
    const markerReferencePath = join(projectMarchDir, "attachments", "session", "reference.webp");
    writeFileSync(markerReferencePath, Buffer.from([9, 10]));
    await generateImage({
      prompt: "draw from marker",
      referenceImages: ["@.march/attachments/session/reference.webp"],
      projectMarchDir,
      authStorage,
      fetchImpl,
      oauthProvider: {
        getApiKey: () => token,
        refreshToken: async (credentials) => credentials,
      },
    });
    assert.deepEqual(requestBody.input[0].content, [
      { type: "input_text", text: "draw from marker" },
      { type: "input_image", image_url: `data:image/webp;base64,${Buffer.from([9, 10]).toString("base64")}`, detail: "high" },
    ]);

    const resolved = resolveImageAttachmentReferences({ text: result.marker, projectMarchDir });
    assert.equal(resolved.images.length, 1);
    assert.equal(resolved.images[0].mimeType, "image/png");
    assert.equal(resolved.images[0].data, imageBase64);

    let openedPath = null;
    let toolGenerateParams = null;
    const tool = createImageGenTool({
      authStorage,
      projectMarchDir,
      generateImageImpl: async (params) => {
        toolGenerateParams = params;
        return { filePath: result.filePath, marker: result.marker, mimeType: "image/png" };
      },
      sendBinary: async (binary) => {
        openedPath = binary.path;
        assert.equal(binary.type, "image");
        assert.equal(binary.mimeType, "image/png");
        return { target: "local", opened: true };
      },
    });
    const toolResult = await tool.execute("call_1", { prompt: "draw a cat", reference_images: [referencePath], aspectRatio: "1:1" });
    const payload = JSON.parse(toolResult.content[0].text);
    assert.equal(payload.success, true);
    assert.equal(payload.image, result.marker);
    assert.equal(payload.path, result.filePath);
    assert.equal(payload.opened, true);
    assert.deepEqual(payload.referenceImages, [referencePath]);
    assert.deepEqual(toolGenerateParams.referenceImages, [referencePath]);
    assert.equal(payload.delivered, true);
    assert.equal(payload.sink.target, "local");
    assert.equal(openedPath, result.filePath);

    let sinkBinary = null;
    const { withBinaryOutputSink } = await import("../src/agent/output/binary-output-sink.mjs");
    const sinkTool = createImageGenTool({
      authStorage,
      projectMarchDir,
      generateImageImpl: async () => ({ filePath: result.filePath, marker: result.marker, mimeType: "image/png" }),
    });
    const sinkResult = await withBinaryOutputSink({
      sendBinary: async (binary) => {
        sinkBinary = binary;
        return { target: "context", opened: true };
      },
    }, () => sinkTool.execute("call_sink", { prompt: "draw a cat" }));
    const sinkPayload = JSON.parse(sinkResult.content[0].text);
    assert.equal(sinkPayload.success, true);
    assert.equal(sinkPayload.sink.target, "context");
    assert.equal(sinkBinary.path, result.filePath);

    const noOpenResult = await tool.execute("call_2", { prompt: "draw a cat", auto_open: false });
    const noOpenPayload = JSON.parse(noOpenResult.content[0].text);
    assert.equal(noOpenPayload.success, true);
    assert.equal(noOpenPayload.opened, false);
    assert.equal(noOpenPayload.delivered, false);
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
