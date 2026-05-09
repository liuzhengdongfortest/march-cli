import { readClipboardImage } from "./image-clipboard.mjs";
import { saveImageAttachment } from "../session/attachments.mjs";

export function pasteClipboardImage({
  ui,
  projectMarchDir,
  sessionId,
  readClipboardImageImpl = readClipboardImage,
  saveImageAttachmentImpl = saveImageAttachment,
  now = new Date(),
} = {}) {
  const image = readClipboardImageImpl();
  if (!image?.ok) return [`Error: ${image?.message || "failed to read clipboard image"}`];

  let saved;
  try {
    saved = saveImageAttachmentImpl({
      projectMarchDir,
      sessionId,
      data: image.data,
      mimeType: image.mimeType,
      source: "clipboard",
      now,
    });
  } catch (err) {
    return [`Error: failed to save clipboard image: ${err.message}`];
  }

  const marker = `@.march/${saved.relativePath}`;
  ui?.insertTextAtCursor?.(withLeadingSpace(ui?.getInputText?.() ?? "", marker));
  return [`Attached image: ${marker}`];
}

export function withLeadingSpace(currentText, marker) {
  if (!String(currentText || "").trim()) return marker;
  return ` ${marker}`;
}
