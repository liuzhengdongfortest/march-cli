import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runAttachmentReferencesSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: attachment marker references ---");
  const { resolveImageAttachmentReferences } = await import("../src/session/attachment-references.mjs");
  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  const attachmentDir = join(projectMarchDir, "attachments", "s1");
  mkdirSync(attachmentDir, { recursive: true });
  writeFileSync(join(attachmentDir, "image.png"), Buffer.from([1, 2, 3]));
  writeFileSync(join(attachmentDir, "image.json"), JSON.stringify({ mimeType: "image/png" }));

  const resolved = resolveImageAttachmentReferences({
    projectMarchDir,
    text: "see @.march/attachments/s1/image.png and @.march/attachments/s1/image.png",
  });
  assert.equal(resolved.images.length, 1);
  assert.deepEqual(resolved.images[0], { type: "image", mimeType: "image/png", data: "AQID" });
  assert.equal(resolved.references[0].marker, "@.march/attachments/s1/image.png");

  assert.throws(
    () => resolveImageAttachmentReferences({
      projectMarchDir,
      text: "@.march/attachments/../../secret.png",
    }),
    /escaped attachments root/,
  );

  cleanup(dir);
  console.log("  PASS");
}
