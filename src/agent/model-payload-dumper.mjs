const MODEL_PAYLOAD_DUMPER_INSTALLED = Symbol("march.modelPayloadDumperInstalled");

export function installModelPayloadDumper(session, modelContextDumper, getKind = () => "model") {
  if (!modelContextDumper?.enabled || !session?.agent) return;
  const agent = session.agent;
  if (agent[MODEL_PAYLOAD_DUMPER_INSTALLED]) return;
  const originalOnPayload = agent.onPayload;
  agent.onPayload = async (payload, model) => {
    const replacement = originalOnPayload ? await originalOnPayload(payload, model) : undefined;
    const effectivePayload = replacement === undefined ? payload : replacement;
    const metadata = {
      provider: model?.provider,
      model: model?.id,
      payload: "provider_request",
    };
    const requestPath = modelContextDumper.dump({
      kind: getKind(),
      prompt: formatModelPayload(effectivePayload),
      metadata,
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

function formatModelPayload(payload) {
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload, null, 2);
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
