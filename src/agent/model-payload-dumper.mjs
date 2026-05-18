import { stripAnsi } from "../text/ansi.mjs";

export { appendProviderUserMessage, replaceProviderContextMessages, replaceProviderSystemPrompt } from "./provider/payload-messages.mjs";

const MODEL_PAYLOAD_DUMPER_INSTALLED = Symbol("march.modelPayloadDumperInstalled");

export function installModelPayloadDumper(session, modelContextDumper, getKind = () => "model", onModelPayload = null, transformPayload = null) {
  if ((!modelContextDumper?.enabled && typeof onModelPayload !== "function" && typeof transformPayload !== "function") || !session?.agent) return;
  const agent = session.agent;
  if (agent[MODEL_PAYLOAD_DUMPER_INSTALLED]) return;
  const originalOnPayload = agent.onPayload;
  agent.onPayload = async (payload, model) => {
    const replacement = originalOnPayload ? await originalOnPayload(payload, model) : undefined;
    const originalEffectivePayload = replacement === undefined ? payload : replacement;
    const kind = getKind();
    const effectivePayload = typeof transformPayload === "function"
      ? transformPayload(originalEffectivePayload, { kind, model })
      : originalEffectivePayload;
    onModelPayload?.({
      payload: effectivePayload,
      model,
      kind,
      estimatedTokens: estimateProviderPayloadTokens(effectivePayload),
    });
    if (!modelContextDumper?.enabled) {
      return effectivePayload !== originalEffectivePayload ? effectivePayload : replacement;
    }
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
    if (effectivePayload !== originalEffectivePayload) return effectivePayload;
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
  const messages = getHumanMessages(request);
  const toolCalls = collectToolCalls(messages);
  if (messages.length === 0) {
    lines.push("(no messages found)", "");
  } else {
    for (const message of messages) {
      lines.push(formatMessageHeading(message, toolCalls), "", formatMessageContent(message.content));
      if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        lines.push("", ...message.tool_calls.map(formatToolCallLine));
      }
      lines.push("");
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

function getHumanMessages(request) {
  if (Array.isArray(request.messages)) return request.messages;
  if (!Array.isArray(request.input)) return [];
  const messages = [];
  if (typeof request.instructions === "string" && request.instructions) {
    messages.push({ role: "system", content: request.instructions });
  }
  for (const item of request.input) {
    if (!item || typeof item !== "object") continue;
    if (item.role) {
      messages.push(item);
      continue;
    }
    messages.push({ role: item.type ?? "input", content: item });
  }
  return messages;
}

function collectToolCalls(messages) {
  const calls = new Map();
  for (const message of messages) {
    if (!Array.isArray(message?.tool_calls)) continue;
    for (const call of message.tool_calls) {
      if (call?.id) calls.set(call.id, call);
    }
  }
  return calls;
}

function formatMessageHeading(message, toolCalls) {
  if (message?.role !== "tool") return `## ${message?.role ?? "message"}`;
  const call = toolCalls.get(message.tool_call_id);
  const name = call?.function?.name ?? message.name;
  return name ? `## tool ${name}` : "## tool";
}

function formatToolCallLine(call) {
  const name = call?.function?.name ?? call?.name ?? "unnamed_tool";
  const args = call?.function?.arguments ?? call?.arguments ?? "";
  return `tool_call ${name}(${stripAnsi(String(args ?? ""))})`;
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
  if (typeof content === "string") return stripAnsi(content);
  if (Array.isArray(content)) return content.map(formatContentPart).join("\n");
  return stripAnsi(JSON.stringify(content, null, 2));
}

function formatContentPart(part) {
  if (typeof part === "string") return stripAnsi(part);
  if (!part || typeof part !== "object") return String(part ?? "");
  if (typeof part.text === "string") return stripAnsi(part.text);
  if (part.type) return stripAnsi(`[${part.type}] ${JSON.stringify(part)}`);
  return stripAnsi(JSON.stringify(part));
}

function formatToolSummary(tool) {
  const name = tool?.function?.name ?? tool?.name ?? tool?.type ?? "unnamed_tool";
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
