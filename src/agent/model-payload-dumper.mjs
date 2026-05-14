const MODEL_PAYLOAD_DUMPER_INSTALLED = Symbol("march.modelPayloadDumperInstalled");

export function installModelPayloadDumper(session, modelContextDumper, getKind = () => "model") {
  if (!modelContextDumper?.enabled || !session?.agent) return;
  const agent = session.agent;
  if (agent[MODEL_PAYLOAD_DUMPER_INSTALLED]) return;
  const originalOnPayload = agent.onPayload;
  agent.onPayload = async (payload, model) => {
    const replacement = originalOnPayload ? await originalOnPayload(payload, model) : undefined;
    const effectivePayload = replacement === undefined ? payload : replacement;
    modelContextDumper.dump({
      kind: getKind(),
      prompt: formatModelPayload(effectivePayload),
      metadata: {
        provider: model?.provider,
        model: model?.id,
        payload: "provider_request",
      },
    });
    return replacement;
  };
  agent[MODEL_PAYLOAD_DUMPER_INSTALLED] = true;
}

function formatModelPayload(payload) {
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload, null, 2);
}
