/**
 * Web fetch tool — fetches a URL and extracts readable content.
 * No API key required. Uses basic HTML-to-text extraction.
 */

const MAX_CONTENT_LENGTH = 50_000;

export async function fetchWebPage(url, { timeout = 15_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "March/0.1 (web-fetch)",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const raw = await res.text();
    return extractText(raw, url);
  } finally {
    clearTimeout(timer);
  }
}

function extractText(html, baseUrl) {
  // Strip scripts, styles, and metadata
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");

  // Convert block elements to newlines
  text = text.replace(/<\/(div|p|h[1-6]|li|tr|article|section|header|footer|nav|main|aside)[^>]*>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/?(div|p|h[1-6]|li|tr|article|section|header|footer|nav|main|aside)[^>]*>/gi, "");

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  if (text.length > MAX_CONTENT_LENGTH) {
    text = text.slice(0, MAX_CONTENT_LENGTH) + "\n\n...(content truncated)";
  }

  return {
    text,
    url: baseUrl,
    length: text.length,
    truncated: text.length >= MAX_CONTENT_LENGTH,
  };
}
