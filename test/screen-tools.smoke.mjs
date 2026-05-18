import { strict as assert } from "node:assert";

const PNG_DATA = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

export async function runScreenToolsSmoke() {
  console.log("--- smoke: screen tools ---");
  const { captureScreenTool, createScreenTool } = await import("../src/agent/screen-tools/screen-tool.mjs");
  const { listWindowsTool, createListWindowsTool } = await import("../src/agent/screen-tools/list-windows-tool.mjs");
  const { createMarchCustomTools } = await import("../src/agent/tools.mjs");

  const visionModel = { id: "vision", provider: "test", input: ["text", "image"] };
  const textModel = { id: "text", provider: "test", input: ["text"] };
  const captureImpl = ({ target, windowId }) => ({
    ok: true,
    target,
    windowId,
    data: PNG_DATA,
    mimeType: "image/png",
    bounds: { x: 1, y: 2, width: 3, height: 4 },
  });

  const desktop = captureScreenTool({ getCurrentModel: () => visionModel, captureScreenImpl: captureImpl });
  assert.equal(desktop.content[1].type, "image");
  assert.equal(desktop.content[1].data, PNG_DATA);
  assert.equal(desktop.details.target, "desktop");

  const window = captureScreenTool({ getCurrentModel: () => visionModel, captureScreenImpl: captureImpl, target: "window", windowId: "0x123" });
  assert.equal(window.details.target, "window");
  assert.equal(window.details.windowId, "0x123");

  const blocked = captureScreenTool({ getCurrentModel: () => textModel, captureScreenImpl: captureImpl });
  assert.equal(blocked.details.error, true);
  assert.equal(blocked.details.unsupportedModel, true);
  assert.ok(blocked.content[0].text.includes("does not support image input"));

  const windows = listWindowsTool({
    listWindowsImpl: () => ({ ok: true, windows: [
      { id: "0x1", title: "Example", process: "app", bounds: { x: 0, y: 0, width: 800, height: 600 } },
    ] }),
  });
  assert.ok(windows.content[0].text.includes("0x1"));
  assert.equal(windows.details.windows.length, 1);

  assert.equal(createScreenTool({ getCurrentModel: () => visionModel, captureScreenImpl: captureImpl }).name, "screen");
  assert.equal(createListWindowsTool({ listWindowsImpl: () => ({ ok: true, windows: [] }) }).name, "list_windows");
  const tools = createMarchCustomTools({ cwd: process.cwd(), engine: {}, ui: {}, getCurrentModel: () => visionModel });
  assert.ok(tools.some((tool) => tool.name === "screen"));
  assert.ok(tools.some((tool) => tool.name === "list_windows"));

  console.log("  PASS");
}
