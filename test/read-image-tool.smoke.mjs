import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ONE_BY_ONE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

export async function runReadImageToolSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: read image tool ---");
  const { createReadImageTool, readImageFile } = await import("../src/agent/file-tools/read-image-tool.mjs");
  const { createMarchCustomTools } = await import("../src/agent/tools.mjs");
  const dir = setupTmp();
  const engine = { resolvePath: (value) => value };

  try {
    const imagePath = join(dir, "pixel.png");
    writeFileSync(imagePath, Buffer.from(ONE_BY_ONE_PNG, "base64"));

    const result = readImageFile({ engine, path: imagePath });
    assert.equal(result.content[0].type, "text");
    assert.ok(result.content[0].text.includes(`Read image file: ${imagePath}`));
    assert.equal(result.content[1].type, "image");
    assert.equal(result.content[1].mimeType, "image/png");
    assert.equal(result.content[1].data, ONE_BY_ONE_PNG);
    assert.equal(result.details.path, imagePath);
    assert.equal(result.details.mimeType, "image/png");
    assert.equal(result.details.sizeBytes, Buffer.from(ONE_BY_ONE_PNG, "base64").length);

    const badPath = join(dir, "notes.txt");
    writeFileSync(badPath, "not an image", "utf8");
    const badResult = readImageFile({ engine, path: badPath });
    assert.equal(badResult.details.error, true);
    assert.ok(badResult.content[0].text.includes("unsupported image type"));

    const nestedDir = join(dir, "nested");
    mkdirSync(nestedDir);
    const directoryResult = readImageFile({ engine, path: nestedDir });
    assert.equal(directoryResult.details.error, true);
    assert.equal(directoryResult.details.isDirectory, true);

    const tool = createReadImageTool({ engine });
    assert.equal(tool.name, "read_image");
    const tools = createMarchCustomTools({ cwd: dir, engine, ui: {} });
    assert.ok(tools.some((candidate) => candidate.name === "read_image"));
  } finally {
    cleanup(dir);
  }

  console.log("  PASS");
}
