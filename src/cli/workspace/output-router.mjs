import { createTuiTimelineRegistry } from "./tui-timeline.mjs";

const PERSIST_FLUSH_METHODS = new Set(["turnEnd", "assistantReplyEnd", "toolEnd"]);

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

export function createWorkspaceOutputRouter({
  ui,
  activeProjectId,
  activeSessionId = null,
  onPersistRenderTimeline = null,
  onRenderTimelineChange = null,
  persistDebounceMs,
} = {}) {
  let active = routeKey(activeProjectId, activeSessionId);
  const timelineRegistry = createTuiTimelineRegistry({
    persistDebounceMs,
    onPersistTimeline: (change) => onPersistRenderTimeline?.({ ...parseRouteKey(change.key), ...change }),
  });

  return {
    setActiveProject(projectId) {
      this.setActiveSession(projectId, null);
    },
    setActiveSession(projectId, sessionId, { renderTimeline = null } = {}) {
      const next = routeKey(projectId, sessionId);
      timelineRegistry.ensure(next, { events: renderTimeline });
      if (next === active) return renderRoute(next);
      timelineRegistry.flush(active, "session-switch");
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
      return timelineRegistry.getEvents(routeKey(projectId, sessionId));
    },
    getRenderBlocks(projectId, sessionId = null) {
      return timelineRegistry.getBlocks(routeKey(projectId, sessionId));
    },
    setRenderEvents(projectId, sessionId = null, events = []) {
      const key = routeKey(projectId, sessionId);
      const timeline = timelineRegistry.clear(key);
      timeline.hydrateIfEmpty(events);
    },
    getRenderEventCount(projectId, sessionId = null) {
      return timelineRegistry.getEventCount(routeKey(projectId, sessionId));
    },
    getRenderTimelineMetadata(projectId, sessionId = null) {
      return timelineRegistry.getMetadata(routeKey(projectId, sessionId));
    },
    flushRenderTimeline(projectId, sessionId = null, reason = "manual") {
      return timelineRegistry.flush(routeKey(projectId, sessionId), reason);
    },
    flushAllRenderTimelines(reason = "manual") {
      return timelineRegistry.flushAll(reason);
    },
  };

  function renderRoute(key) {
    ui.clearOutput?.();
    const timeline = timelineRegistry.ensure(key);
    return timeline.replayTo(ui);
  }

  function recordRenderEvent(key, method, args) {
    if (method === "clearOutput") {
      const timeline = timelineRegistry.clear(key);
      onRenderTimelineChange?.({ ...parseRouteKey(key), events: [], event: { method, args }, timeline: timeline.getMetadata() });
      return;
    }
    const timeline = timelineRegistry.ensure(key);
    timeline.apply(method, args);
    if (PERSIST_FLUSH_METHODS.has(method)) timeline.flushPersist(method);
    onRenderTimelineChange?.({ ...parseRouteKey(key), events: timeline.getEvents(), event: { method, args }, timeline: timeline.getMetadata() });
  }
}

export function routeKey(projectId, sessionId = null) {
  return `${projectId ?? ""}:${sessionId ?? ""}`;
}

function parseRouteKey(key) {
  const [projectId, sessionId = ""] = String(key ?? "").split(":", 2);
  return { projectId: projectId || null, sessionId: sessionId || null };
}
