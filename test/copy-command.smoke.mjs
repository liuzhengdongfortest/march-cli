import { strict as assert } from "node:assert";

export async function runCopyCommandSmoke() {
  console.log("--- smoke: copy command ---");
  const {
    copyLastAssistantMessage,
    findLastAssistantMessage,
    writeSystemClipboard,
  } = await import("../src/cli/copy-command.mjs");

  const engine = {
    turns: [
      { assistantMessage: "" },
      { assistantMessage: "first" },
      { assistantMessage: "last response" },
    ],
  };
  assert.equal(findLastAssistantMessage(engine), "last response");

  const copied = [];
  assert.deepEqual(copyLastAssistantMessage({
    engine,
    writeClipboard: (text) => {
      copied.push(text);
      return { ok: true };
    },
  }), ["Copied last assistant response (13 chars)"]);
  assert.deepEqual(copied, ["last response"]);

  assert.deepEqual(copyLastAssistantMessage({
    engine: { turns: [{ assistantMessage: "" }] },
    writeClipboard: () => ({ ok: true }),
  }), ["Error: no assistant response to copy"]);

  assert.deepEqual(copyLastAssistantMessage({
    engine,
    writeClipboard: () => ({ ok: false, message: "clipboard unavailable" }),
  }), ["Error: clipboard unavailable"]);

  assert.equal(writeSystemClipboard("x", { platform: "plan9" }).ok, false);
  console.log("  PASS");
}
