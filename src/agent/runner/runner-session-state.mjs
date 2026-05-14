export function getRunnerSessionStats(activeSession, runtimeHost) {
  const stats = activeSession.getSessionStats();
  const manager = activeSession.sessionManager;
  return {
    ...stats,
    runtimeHost: Boolean(runtimeHost),
    piSessionSwitching: Boolean(runtimeHost),
    persisted: manager?.isPersisted?.() ?? Boolean(activeSession.sessionFile),
    sessionFile: manager?.getSessionFile?.() ?? activeSession.sessionFile,
  };
}

export function syncEngineSessionState(engine, session) {
  bindToolDefs(engine, session);
  engine.setRuntimeState({
    modelId: session.model?.id,
    provider: session.model?.provider,
    thinkingLevel: session.thinkingLevel,
  });
}

function bindToolDefs(engine, session) {
  engine.setToolDefs(session.getActiveToolNames().map((name) => {
    const tool = session.getToolDefinition(name);
    return {
      name,
      description: tool?.description ?? "",
      parameters: tool?.parameters ? describeParams(tool.parameters) : null,
    };
  }));
}

function describeParams(schema) {
  if (!schema || !schema.properties) return {};
  const out = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    out[key] = prop.description ?? key;
  }
  return out;
}
