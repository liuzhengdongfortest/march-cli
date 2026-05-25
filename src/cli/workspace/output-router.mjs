const RENDER_METHODS = new Set([
  "turnStart",
  "turnEnd",
  "assistantReplyEnd",
  "textDelta",
  "thinkingStart",
  "thinkingDelta",
  "thinkingEnd",
  "thinkingBlock",
  "toolStart",
  "toolEnd",
  "retryStart",
  "retryEnd",
  "status",
  "recall",
  "editDiff",
  "write",
  "writeln",
  "clearOutput",
]);

const MAX_RENDER_EVENTS_PER_ROUTE = 4000;

export function createWorkspaceOutputRouter({ ui, activeProjectId, activeSessionId = null, onRenderTimelineChange = null }) {
  let active = routeKey(activeProjectId, activeSessionId);
  const timelines = new Map();

  return {
    setActiveProject(projectId) {
      this.setActiveSession(projectId, null);
    },
    setActiveSession(projectId, sessionId, { renderTimeline = null } = {}) {
      const next = routeKey(projectId, sessionId);
      if (Array.isArray(renderTimeline)) setRenderEvents(next, renderTimeline);
      if (next === active) return renderRoute(next);
      active = next;
      return renderRoute(next);
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
            if (!RENDER_METHODS.has(prop)) return value.apply(ui, args);
            recordRenderEvent(key, prop, args);
            if (key === active) return value.apply(ui, args);
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
    renderActiveSession() {
      return renderRoute(active);
    },
    getRenderEvents(projectId, sessionId = null) {
      return [...(timelines.get(routeKey(projectId, sessionId)) ?? [])];
    },
    setRenderEvents(projectId, sessionId = null, events = []) {
      setRenderEvents(routeKey(projectId, sessionId), events);
    },
    getRenderEventCount(projectId, sessionId = null) {
      return timelines.get(routeKey(projectId, sessionId))?.length ?? 0;
    },
  };

  function renderRoute(key) {
    ui.clearOutput?.();
    const events = timelines.get(key) ?? [];
    for (const event of events) applyRenderEvent(event);
    return events.length;
  }

  function applyRenderEvent({ method, args }) {
    const value = ui[method];
    if (typeof value === "function") value.apply(ui, args);
  }

  function recordRenderEvent(key, method, args) {
    if (method === "clearOutput") {
      timelines.delete(key);
      onRenderTimelineChange?.({ ...parseRouteKey(key), events: [], event: { method, args } });
      return;
    }
    const events = timelines.get(key) ?? [];
    events.push({ method, args, at: Date.now() });
    if (events.length > MAX_RENDER_EVENTS_PER_ROUTE) events.splice(0, events.length - MAX_RENDER_EVENTS_PER_ROUTE);
    timelines.set(key, events);
    onRenderTimelineChange?.({ ...parseRouteKey(key), events: [...events], event: { method, args } });
  }

  function setRenderEvents(key, events) {
    timelines.set(key, normalizeRenderEvents(events));
  }
}

export function routeKey(projectId, sessionId = null) {
  return `${projectId ?? ""}:${sessionId ?? ""}`;
}

function parseRouteKey(key) {
  const [projectId, sessionId = ""] = String(key ?? "").split(":", 2);
  return { projectId: projectId || null, sessionId: sessionId || null };
}

function normalizeRenderEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.filter((event) => typeof event?.method === "string" && Array.isArray(event.args));
}
