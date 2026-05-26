export function captureAvatarContextSnapshot({ engine = null, parentSessionId = null, currentUserRequest = "" } = {}) {
  const createdAt = new Date().toISOString();
  return {
    created_at: createdAt,
    parent_session_id: parentSessionId ?? null,
    current_user_request: String(currentUserRequest ?? "").trim(),
    inherited_context: engine ? captureInheritedContext(engine) : null,
  };
}

export function formatParentCurrentState(snapshot) {
  if (!snapshot) return "(no parent context snapshot was available)";
  const lines = [
    `created_at: ${snapshot.created_at ?? "unknown"}`,
    `parent_session_id: ${snapshot.parent_session_id ?? "unknown"}`,
    "",
    "Current user request:",
    snapshot.current_user_request || "(unknown)",
    "",
    "Inherited context:",
  ];
  const inherited = snapshot.inherited_context;
  if (!inherited) {
    lines.push("- none");
  } else {
    lines.push(
      `- recent_chat_turns: ${inherited.turns?.length ?? 0}`,
      `- session_name: ${inherited.sessionName || "(none)"}`,
      `- injections: ${inherited.injections?.length ?? 0}`,
      "- raw parent in-turn transcript: not inherited"
    );
  }
  return lines.join("\n");
}

export function createInheritedContextEngineOptions(snapshot) {
  const inherited = snapshot?.inherited_context;
  if (!inherited) return {};
  return {
    memoryRoot: inherited.memoryRoot ?? null,
    remoteMemorySources: inherited.remoteMemorySources ?? [],
    profilePaths: inherited.profilePaths ?? null,
    injections: inherited.injections ?? [],
  };
}

export function restoreInheritedContext(engine, snapshot) {
  const inherited = snapshot?.inherited_context;
  if (!inherited) return;
  engine.restoreSession({
    turns: inherited.turns ?? [],
    sessionName: inherited.sessionName ?? "",
    modelId: engine.modelId,
    provider: engine.provider,
    thinkingLevel: engine.thinkingLevel,
  }, null, { replace: true });
}

function captureInheritedContext(engine) {
  return cloneJson({
    memoryRoot: engine.memoryRoot ?? null,
    remoteMemorySources: engine.remoteMemorySources ?? [],
    profilePaths: engine.profilePaths ?? null,
    injections: engine.injections ?? [],
    turns: engine.turns ?? [],
    sessionName: engine.sessionName ?? "",
    modelId: engine.modelId ?? null,
    provider: engine.provider ?? null,
    thinkingLevel: engine.thinkingLevel ?? null,
  });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}
