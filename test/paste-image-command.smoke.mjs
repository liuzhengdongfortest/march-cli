import { strict as assert } from "node:assert";

export async function runPasteImageCommandSmoke() {
  console.log("--- smoke: paste image command ---");
  const {
    pasteClipboardImage,
    withLeadingSpace,
  } = await import("../src/cli/commands/paste-image-command.mjs");

  assert.equal(withLeadingSpace("", "@.march/a.png"), "@.march/a.png");
  assert.equal(withLeadingSpace("describe", "@.march/a.png"), " @.march/a.png");

  const inserted = [];
  const lines = pasteClipboardImage({
    ui: {
      getInputText: () => "describe this",
      insertTextAtCursor: (text) => inserted.push(text),
    },
    projectMarchDir: "D:/repo/.march",
    sessionId: "s1",
    readClipboardImageImpl: () => ({ ok: true, mimeType: "image/png", data: "AQID" }),
    saveImageAttachmentImpl: (input) => {
      assert.equal(input.projectMarchDir, "D:/repo/.march");
      assert.equal(input.sessionId, "s1");
      assert.equal(input.mimeType, "image/png");
      assert.equal(input.source, "clipboard");
      return { relativePath: "attachments/s1/image.png" };
    },
  });
  assert.deepEqual(inserted, [" @.march/attachments/s1/image.png"]);
  assert.deepEqual(lines, ["Attached image: [image: image.png]"]);

  const attachmentInserts = [];
  const tokenLines = pasteClipboardImage({
    ui: {
      insertAttachmentAtCursor: (attachment) => attachmentInserts.push(attachment),
    },
    projectMarchDir: "D:/repo/.march",
    sessionId: "s1",
    readClipboardImageImpl: () => ({ ok: true, mimeType: "image/png", data: "AQID" }),
    saveImageAttachmentImpl: () => ({ relativePath: "attachments/s1/clip.png" }),
  });
  assert.deepEqual(attachmentInserts, [{
    marker: "@.march/attachments/s1/clip.png",
    label: "[image: clip.png]",
  }]);
  assert.deepEqual(tokenLines, ["Attached image: [image: clip.png]"]);

  assert.deepEqual(pasteClipboardImage({
    ui: { insertTextAtCursor: () => inserted.push("bad") },
    readClipboardImageImpl: () => ({ ok: false, message: "no image" }),
  }), ["Error: no image"]);
  assert.equal(inserted.length, 1);

  assert.deepEqual(pasteClipboardImage({
    ui: { insertTextAtCursor: () => inserted.push("bad") },
    readClipboardImageImpl: () => ({ ok: true, mimeType: "image/png", data: "AQID" }),
    saveImageAttachmentImpl: () => {
      throw new Error("disk full");
    },
  }), ["Error: failed to save clipboard image: disk full"]);
  assert.equal(inserted.length, 1);
  console.log("  PASS");
}
