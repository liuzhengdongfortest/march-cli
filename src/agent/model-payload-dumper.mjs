const MODEL_PAYLOAD_DUMPER_INSTALLED = Symbol("march.modelPayloadDumperInstalled");

export function installModelPayloadDumper(session, modelContextDumper, getKind = () => "model", onModelPayload = null) {
  if ((!modelContextDumper?.enabled && typeof onModelPayload !== "function") || !session?.agent) return;
  const agent = session.agent;
  if (agent[MODEL_PAYLOAD_DUMPER_INSTALLED]) return;
  const originalOnPayload = agent.onPayload;
  agent.onPayload = async (payload, model) => {
    const replacement = originalOnPayload ? await originalOnPayload(payload, model) : undefined;
    const effectivePayload = replacement === undefined ? payload : replacement;
    const kind = getKind();
    onModelPayload?.({
      payload: effectivePayload,
      model,
      kind,
      estimatedTokens: estimateProviderPayloadTokens(effectivePayload),
    });
    if (!modelContextDumper?.enabled) return replacement;
    const metadata = {
      provider: model?.provider,
      model: model?.id,
      payload: "provider_request",
    };
    const requestPath = modelContextDumper.dump({
      kind,
      prompt: formatHumanPayload(effectivePayload),
      metadata,
    });
    modelContextDumper.dumpSidecar?.({
      sourcePath: requestPath,
      suffix: "payload",
      value: effectivePayload,
    });
    const tools = extractPayloadTools(effectivePayload);
    if (tools) {
      modelContextDumper.dumpSidecar?.({
        sourcePath: requestPath,
        suffix: "tools",
        value: {
          metadata: { ...metadata, payload: "provider_tools" },
          tools,
        },
      });
    }
    return replacement;
  };
  agent[MODEL_PAYLOAD_DUMPER_INSTALLED] = true;
}

export function estimateProviderPayloadTokens(payload) {
  const request = normalizePayload(payload);
  let chars = 0;
  for (const key of ["system", "systemPrompt", "instructions"]) {
    chars += textChars(request[key]);
  }
  for (const key of ["messages", "input"]) {
    if (Array.isArray(request[key])) chars += textChars(request[key]);
  }
  const tools = extractPayloadTools(payload);
  if (tools?.length) chars += JSON.stringify(tools).length;
  if (chars === 0) chars = JSON.stringify(request).length;
  return Math.ceil(chars / 4);
}

function formatHumanPayload(payload) {
  const request = normalizePayload(payload);
  const lines = ["# Messages", ""];
  const messages = Array.isArray(request.messages) ? request.messages : [];
  if (messages.length === 0) {
    lines.push("(no messages found)", "");
  } else {
    for (const message of messages) {
      lines.push(`## ${message.role ?? "message"}`, "", formatMessageContent(message.content), "");
    }
  }

  const tools = extractPayloadTools(payload);
  if (tools?.length) {
    lines.push("# Tools", "");
    for (const tool of tools) lines.push(`- ${formatToolSummary(tool)}`);
    lines.push("");
  }

  lines.push("# Raw Payload", "", "See the sibling `*-payload.json` file for the exact provider request.");
  if (tools?.length) lines.push("See the sibling `*-tools.json` file for the complete tool schema.");
  return lines.join("\n");
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object") return { messages: [{ role: "payload", content: String(payload ?? "") }] };
  if (Array.isArray(payload.messages)) return payload;
  if (payload.body && typeof payload.body === "object") return payload.body;
  if (typeof payload.body === "string") {
    try {
      return JSON.parse(payload.body);
    } catch {}
  }
  return payload;
}

function formatMessageContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(formatContentPart).join("\n");
  return JSON.stringify(content, null, 2);
}

function formatContentPart(part) {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return String(part ?? "");
  if (typeof part.text === "string") return part.text;
  if (part.type) return `[${part.type}] ${JSON.stringify(part)}`;
  return JSON.stringify(part);
}

function formatToolSummary(tool) {
  const name = tool?.function?.name ?? tool?.name ?? "unnamed_tool";
  const description = tool?.function?.description ?? tool?.description ?? "";
  return description ? `${name}: ${description}` : name;
}

function extractPayloadTools(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (Array.isArray(payload.tools)) return payload.tools;
  if (payload.body && typeof payload.body === "object" && Array.isArray(payload.body.tools)) return payload.body.tools;
  if (typeof payload.body === "string") {
    try {
      const body = JSON.parse(payload.body);
      if (Array.isArray(body.tools)) return body.tools;
    } catch {}
  }
  return null;
}

function textChars(value) {
  if (value == null) return 0;
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + textChars(item), 0);
  if (typeof value !== "object") return String(value).length;
  if (typeof value.text === "string") return value.text.length;
  if (typeof value.content === "string") return value.content.length;
  if (Array.isArray(value.content)) return textChars(value.content);
  if (value.type === "image" || value.type === "image_url") return 0;
  return JSON.stringify(value).length;
}
