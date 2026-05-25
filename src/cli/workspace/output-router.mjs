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

export function createWorkspaceOutputRouter({ ui, activeProjectId }) {
  let active = activeProjectId ?? null;
  const buffers = new Map();

  return {
    setActiveProject(projectId) {
      active = projectId ?? null;
    },
    getActiveProject() {
      return active;
    },
    createProjectUi(projectId) {
      return new Proxy({}, {
        get(_target, prop) {
          if (prop === "__projectId") return projectId;
          const value = ui[prop];
          if (typeof value !== "function") return value;
          return (...args) => {
            if (projectId === active || !BACKGROUND_METHODS_TO_BUFFER.has(prop)) return value.apply(ui, args);
            bufferBackgroundCall(projectId, prop, args);
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
    getBufferedCalls(projectId) {
      return [...(buffers.get(projectId) ?? [])];
    },
    clearBufferedCalls(projectId) {
      buffers.delete(projectId);
    },
  };

  function bufferBackgroundCall(projectId, method, args) {
    const calls = buffers.get(projectId) ?? [];
    calls.push({ method, args, at: Date.now() });
    if (calls.length > 2000) calls.splice(0, calls.length - 2000);
    buffers.set(projectId, calls);
  }
}
