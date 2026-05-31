import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const PNG_DATA = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

export async function runAnalyzeImagesToolSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: analyze_images tool ---");
  const { analyzeImages, createAnalyzeImagesTool, normalizeImageModelSelection } = await import("../src/agent/vision-tools/analyze-images-tool.mjs");
  const dir = setupTmp();
  const imagePath = join(dir, "one.png");
  writeFileSync(imagePath, Buffer.from(PNG_DATA, "base64"));
  const engine = { resolvePath: (path) => path };

  assert.deepEqual(normalizeImageModelSelection({ provider: "openai", model: "gpt-4.1" }), { provider: "openai", model: "gpt-4.1" });
  assert.equal(normalizeImageModelSelection({ provider: "openai" }), null);
  assert.equal(createAnalyzeImagesTool({ engine }).name, "analyze_images");

  const missingConfig = await analyzeImages({ engine, images: [{ path: imagePath }], prompt: "describe" });
  assert.equal(missingConfig.details.error, true);
  assert.equal(missingConfig.details.missingImageModel, true);

  const unavailableModel = await analyzeImages({
    engine,
    modelRegistry: { find: () => null },
    imageModel: { provider: "openai", model: "gpt-4.1" },
    images: [{ path: imagePath }],
    prompt: "describe",
  });
  assert.equal(unavailableModel.details.error, true);
  assert.ok(unavailableModel.content[0].text.includes("not found"));

  const textOnlyModel = await analyzeImages({
    engine,
    modelRegistry: { find: () => ({ id: "text", provider: "test", input: ["text"] }) },
    imageModel: { provider: "test", model: "text" },
    images: [{ path: imagePath }],
    prompt: "describe",
  });
  assert.equal(textOnlyModel.details.unsupportedImageModel, true);

  cleanup(dir);
  console.log("  PASS");
}
