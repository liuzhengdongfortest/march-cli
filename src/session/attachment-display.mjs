import { basename } from "node:path";

const ATTACHMENT_MARKER_RE = /@\.march\/attachments\/[^\s"'`<>)]+/g;

export function formatAttachmentMarkerForDisplay(marker) {
  const name = basename(String(marker || "").replace(/\\/g, "/")) || "image";
  return `[image: ${name}]`;
}

export function formatMessageAttachmentsForDisplay(text) {
  return String(text || "").replace(ATTACHMENT_MARKER_RE, (marker) => formatAttachmentMarkerForDisplay(marker));
}
