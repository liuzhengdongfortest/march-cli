import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runSendBinaryToolSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: send binary tool ---");
  const { createSendBinaryTool, normalizeBinaryOutput } = await import("../src/agent/output/send-binary-tool.mjs");
  const { createMarchCustomTools } = await import("../src/agent/tools.mjs");
  const { withBinaryOutputSink, sendBinaryOutput } = await import("../src/agent/output/binary-output-sink.mjs");
  const dir = setupTmp();
  try {
    const filePath = join(dir, "image.png");
    writeFileSync(filePath, "png", "utf8");
    const engine = { resolvePath: (value) => join(dir, value) };

    const normalized = normalizeBinaryOutput({ type: "image", path: "image.png", caption: "hello" }, { engine });
    assert.equal(normalized.path, filePath);
    assert.equal(normalized.mimeType, "image/png");
    assert.equal(normalized.caption, "hello");

    const sent = [];
    const tool = createSendBinaryTool({ engine, sendBinary: async (binary) => {
      sent.push(binary);
      return { target: "test" };
    } });
    const result = await tool.execute("call", { type: "image", path: "image.png" });
    assert.equal(result.details.error, undefined);
    assert.equal(sent[0].path, filePath);

    const contextResult = await withBinaryOutputSink({ sendBinary: async (binary) => ({ target: "context", type: binary.type }) }, () => (
      sendBinaryOutput({ type: "video", url: "https://example.com/video.mp4" })
    ));
    assert.deepEqual(contextResult, { target: "context", type: "video" });

    mkdirSync(join(dir, "nested"));
    const bad = await tool.execute("call", { type: "image", path: "nested" });
    assert.equal(bad.details.error, true);

    const tools = createMarchCustomTools({ cwd: dir, engine, ui: {} });
    assert.ok(tools.some((candidate) => candidate.name === "send_binary"));
  } finally {
    cleanup(dir);
  }
  console.log("  PASS");
}
