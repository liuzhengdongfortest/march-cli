import { strict as assert } from "node:assert";

export async function runAttachmentDisplaySmoke() {
  console.log("--- smoke: attachment display formatting ---");
  const {
    formatAttachmentMarkerForDisplay,
    formatMessageAttachmentsForDisplay,
  } = await import("../src/session/attachment-display.mjs");

  assert.equal(
    formatAttachmentMarkerForDisplay("@.march/attachments/s1/image.png"),
    "[image: image.png]",
  );
  assert.equal(
    formatMessageAttachmentsForDisplay("see @.march/attachments/s1/image.png please"),
    "see [image: image.png] please",
  );
  console.log("  PASS");
}
