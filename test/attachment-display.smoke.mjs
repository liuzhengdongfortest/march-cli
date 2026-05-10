import { strict as assert } from "node:assert";

export async function runAttachmentDisplaySmoke() {
  console.log("--- smoke: attachment display formatting ---");
  const {
    formatAttachmentDisplayName,
    formatAttachmentMarkerForDisplay,
    formatMessageAttachmentsForDisplay,
  } = await import("../src/session/attachment-display.mjs");

  assert.equal(
    formatAttachmentDisplayName("2026-05-10T03-36-59-457Z_35e714fc.png"),
    "35e714fc.png",
  );
  assert.equal(
    formatAttachmentMarkerForDisplay("@.march/attachments/s1/image.png"),
    "[image: image.png]",
  );
  assert.equal(
    formatAttachmentMarkerForDisplay("@.march/attachments/s1/2026-05-10T03-36-59-457Z_35e714fc.png"),
    "[image: 35e714fc.png]",
  );
  assert.equal(
    formatMessageAttachmentsForDisplay("see @.march/attachments/s1/2026-05-10T03-36-59-457Z_35e714fc.png please"),
    "see [image: 35e714fc.png] please",
  );
  console.log("  PASS");
}
