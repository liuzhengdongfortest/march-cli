import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function runAttachmentsSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: image attachments ---");
  const {
    getAttachmentRoot,
    getSessionAttachmentDir,
    imageExtensionForMime,
    sanitizePathSegment,
    saveImageAttachment,
  } = await import("../src/session/attachments.mjs");

  const dir = setupTmp();
  const projectMarchDir = join(dir, ".march");
  const saved = saveImageAttachment({
    projectMarchDir,
    sessionId: "pi/session:1",
    data: Buffer.from([1, 2, 3]),
    mimeType: "image/png",
    source: "clipboard",
    now: new Date("2026-05-10T00:00:00.000Z"),
    id: "img:1",
  });

  assert.equal(getAttachmentRoot(projectMarchDir), join(projectMarchDir, "attachments"));
  assert.equal(getSessionAttachmentDir({ projectMarchDir, sessionId: "pi/session:1" }), join(projectMarchDir, "attachments", "pi-session-1"));
  assert.equal(imageExtensionForMime("image/jpeg"), "jpg");
  assert.equal(sanitizePathSegment("../bad name"), "bad-name");
  assert.ok(saved.path.endsWith(join("attachments", "pi-session-1", "2026-05-10T00-00-00-000Z_img-1.png")));
  assert.ok(saved.metadataPath.endsWith(join("attachments", "pi-session-1", "2026-05-10T00-00-00-000Z_img-1.json")));
  assert.equal(saved.relativePath, "attachments/pi-session-1/2026-05-10T00-00-00-000Z_img-1.png");
  assert.equal(existsSync(saved.path), true);
  assert.equal(readFileSync(saved.path).length, 3);
  assert.deepEqual(JSON.parse(readFileSync(saved.metadataPath, "utf8")), {
    version: 1,
    sessionId: "pi/session:1",
    source: "clipboard",
    mimeType: "image/png",
    sizeBytes: 3,
    createdAt: "2026-05-10T00:00:00.000Z",
    filename: "2026-05-10T00-00-00-000Z_img-1.png",
    relativePath: "attachments/pi-session-1/2026-05-10T00-00-00-000Z_img-1.png",
  });

  const fromBase64 = saveImageAttachment({
    projectMarchDir,
    sessionId: "s2",
    data: Buffer.from([4]).toString("base64"),
    mimeType: "image/webp",
    now: new Date("2026-05-10T00:00:01.000Z"),
    id: "b",
  });
  assert.equal(readFileSync(fromBase64.path).length, 1);

  assert.throws(() => imageExtensionForMime("text/plain"), /unsupported image mime type/);
  assert.throws(() => saveImageAttachment({
    projectMarchDir,
    sessionId: "s",
    data: Buffer.alloc(0),
    mimeType: "image/png",
  }), /attachment data is empty/);

  cleanup(dir);
  console.log("  PASS");
}
