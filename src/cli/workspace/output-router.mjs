const BACKGROUND_METHODS_TO_BUFFER = new Set([
  "turnStart",
  "turnEnd",
  "assistantReplyEnd",
  "textDelta",
  "thinkingStart",
  "thinkingDelta",
  "thinkingEnd",
  "toolStart",
  "toolEnd",
  "retryStart",
  "retryEnd",
  "status",
  "debugLines",
  "recall",
  "providerQuotaSnapshot",
  "editDiff",
  "requestPermission",
  "writeln",
]);

export function createWorkspaceOutputRouter({ ui, activeProjectId, activeSessionId = null }) {
  let active = routeKey(activeProjectId, activeSessionId);
  const buffers = new Map();

  return {
    setActiveProject(projectId) {
      active = routeKey(projectId, null);
    },
    setActiveSession(projectId, sessionId) {
      active = routeKey(projectId, sessionId);
    },
    getActiveRouteKey() {
      return active;
    },
    getActiveProject() {
      return parseRouteKey(active).projectId;
    },
    createProjectUi(projectId, getSessionId = null) {
      return this.createSessionUi({ projectId, getSessionId });
    },
    createSessionUi({ projectId, sessionId = null, getSessionId = null }) {
      return new Proxy({}, {
        get(_target, prop) {
          if (prop === "__projectId") return projectId;
          const value = ui[prop];
          if (typeof value !== "function") return value;
          return (...args) => {
            const key = routeKey(projectId, typeof getSessionId === "function" ? getSessionId() : sessionId);
            if (isActiveRoute(key) || !BACKGROUND_METHODS_TO_BUFFER.has(prop)) return value.apply(ui, args);
            bufferBackgroundCall(key, prop, args);
            if (prop === "requestPermission") return false;
            return undefined;
          };
        },
        set(_target, prop, value) {
          ui[prop] = value;
          return true;
        },
        has(_target, prop) {
          return prop in ui;
        },
      });
    },
    getBufferedCalls(projectId, sessionId = null) {
      return [...(buffers.get(routeKey(projectId, sessionId)) ?? [])];
    },
    getBufferedCallCount(projectId, sessionId = null) {
      return buffers.get(routeKey(projectId, sessionId))?.length ?? 0;
    },
    replayBufferedCalls(projectId, sessionId = null) {
      const key = routeKey(projectId, sessionId);
      const calls = buffers.get(key) ?? [];
      buffers.delete(key);
      for (const call of calls) replayBufferedCall(call);
      return calls.length;
    },
    clearBufferedCalls(projectId, sessionId = null) {
      buffers.delete(routeKey(projectId, sessionId));
    },
  };

  function isActiveRoute(key) {
    if (key === active) return true;
    const current = parseRouteKey(active);
    const candidate = parseRouteKey(key);
    return current.sessionId == null && current.projectId === candidate.projectId;
  }

  function replayBufferedCall({ method, args }) {
    if (method === "requestPermission") return;
    const value = ui[method];
    if (typeof value === "function") value.apply(ui, args);
  }

  function bufferBackgroundCall(key, method, args) {
    const calls = buffers.get(key) ?? [];
    calls.push({ method, args, at: Date.now() });
    if (calls.length > 2000) calls.splice(0, calls.length - 2000);
    buffers.set(key, calls);
  }
}

export function routeKey(projectId, sessionId = null) {
  return `${projectId ?? ""}:${sessionId ?? ""}`;
}

function parseRouteKey(key) {
  const [projectId, sessionId = ""] = String(key ?? "").split(":", 2);
  return { projectId: projectId || null, sessionId: sessionId || null };
}
