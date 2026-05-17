export function successEnvelope({ credentialSource, action, model, query, answer = "", citations = [], inlineCitations = [], artifacts = [], extra = {} }) {
  return {
    success: true,
    provider: "xai",
    credential_source: credentialSource,
    action,
    model,
    query,
    answer,
    citations,
    inline_citations: inlineCitations,
    artifacts,
    ...extra,
  };
}

export function errorEnvelope({ credentialSource = null, action, model = null, query = "", error, errorType = "error" }) {
  return {
    success: false,
    provider: "xai",
    credential_source: credentialSource,
    action,
    model,
    query,
    error,
    error_type: errorType,
  };
}

export function extractResponseText(payload) {
  const outputText = String(payload?.output_text || "").trim();
  if (outputText) return outputText;

  const parts = [];
  for (const item of payload?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item.content || []) {
      if (content?.type !== "output_text" && content?.type !== "text") continue;
      const text = String(content.text || "").trim();
      if (text) parts.push(text);
    }
  }
  return parts.join("\n\n").trim();
}

export function extractInlineCitations(payload) {
  const citations = [];
  for (const item of payload?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item.content || []) {
      for (const annotation of content.annotations || []) {
        if (annotation?.type !== "url_citation") continue;
        citations.push({
          url: annotation.url || "",
          title: annotation.title || "",
          start_index: annotation.start_index,
          end_index: annotation.end_index,
        });
      }
    }
  }
  return citations;
}

export async function readErrorMessage(response) {
  const text = await response.text().catch(() => "");
  if (!text) return response.statusText || `HTTP ${response.status}`;
  try {
    const json = JSON.parse(text);
    if (typeof json.error === "string") return json.code && !json.error.includes(json.code) ? `${json.code}: ${json.error}` : json.error;
    if (json.error?.message) return json.error.message;
    return JSON.stringify(json).slice(0, 500);
  } catch {
    return text.slice(0, 500);
  }
}
