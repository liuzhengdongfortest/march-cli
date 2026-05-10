import { basename } from "node:path";

const ATTACHMENT_MARKER_RE = /@\.march\/attachments\/[^\s"'`<>)]+/g;

export function formatAttachmentMarkerForDisplay(marker) {
  const name = formatAttachmentDisplayName(basename(String(marker || "").replace(/\\/g, "/")) || "image");
  return `[image: ${name}]`;
}

export function formatMessageAttachmentsForDisplay(text) {
  return String(text || "").replace(ATTACHMENT_MARKER_RE, (marker) => formatAttachmentMarkerForDisplay(marker));
}

export function formatAttachmentDisplayName(name) {
  return String(name || "image").replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_/, "");
}
