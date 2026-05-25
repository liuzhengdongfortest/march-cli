export const DEFAULT_MAX_TIMELINE_EVENTS = 4000;

export function createTuiTimelineRegistry({ maxEventsPerTimeline = DEFAULT_MAX_TIMELINE_EVENTS } = {}) {
  const timelines = new Map();

  return {
    ensure(key, { events = null } = {}) {
      let timeline = timelines.get(key);
      if (!timeline) {
        timeline = createTuiTimelineInstance({ key, maxEvents: maxEventsPerTimeline });
        timelines.set(key, timeline);
      }
      if (Array.isArray(events)) timeline.hydrateIfEmpty(events);
      return timeline;
    },
    get(key) {
      return timelines.get(key) ?? null;
    },
    has(key) {
      return timelines.has(key);
    },
    clear(key) {
      const timeline = this.ensure(key);
      timeline.clear();
      return timeline;
    },
    getEvents(key) {
      return this.get(key)?.getEvents() ?? [];
    },
    getEventCount(key) {
      return this.get(key)?.getEventCount() ?? 0;
    },
    getMetadata(key) {
      return this.get(key)?.getMetadata() ?? null;
    },
  };
}

export function createTuiTimelineInstance({ key, maxEvents = DEFAULT_MAX_TIMELINE_EVENTS } = {}) {
  let events = [];
  let hydrated = false;
  let dirty = false;
  let lastAccessedAt = Date.now();
  let lastUpdatedAt = null;
  let estimatedBytes = 0;

  return {
    key,
    apply(method, args, { at = Date.now() } = {}) {
      touch();
      const event = { method, args, at };
      events.push(event);
      trimToBudget();
      dirty = true;
      lastUpdatedAt = at;
      return event;
    },
    hydrateIfEmpty(nextEvents) {
      touch();
      if (events.length > 0) return false;
      events = normalizeTimelineEvents(nextEvents);
      trimToBudget();
      hydrated = true;
      dirty = false;
      lastUpdatedAt = events.at(-1)?.at ?? null;
      estimatedBytes = estimateEventsBytes(events);
      return true;
    },
    clear() {
      touch();
      events = [];
      dirty = true;
      lastUpdatedAt = Date.now();
      estimatedBytes = 0;
    },
    replayTo(ui) {
      touch();
      for (const event of events) applyRenderEvent(ui, event);
      return events.length;
    },
    getEvents() {
      touch();
      return events.map((event) => ({ method: event.method, args: event.args, at: event.at ?? null }));
    },
    getEventCount() {
      return events.length;
    },
    markPersisted() {
      dirty = false;
    },
    getMetadata() {
      return {
        key,
        eventCount: events.length,
        maxEvents,
        hydrated,
        dirty,
        lastAccessedAt,
        lastUpdatedAt,
        estimatedBytes,
      };
    },
  };

  function trimToBudget() {
    if (events.length > maxEvents) events.splice(0, events.length - maxEvents);
    estimatedBytes = estimateEventsBytes(events);
  }

  function touch() {
    lastAccessedAt = Date.now();
  }
}

export function normalizeTimelineEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .filter((event) => typeof event?.method === "string" && Array.isArray(event.args))
    .map((event) => ({ method: event.method, args: event.args, at: event.at ?? null }));
}

function applyRenderEvent(ui, { method, args }) {
  const value = ui[method];
  if (typeof value === "function") value.apply(ui, args);
}

function estimateEventsBytes(events) {
  return events.reduce((total, event) => total + estimateEventBytes(event), 0);
}

function estimateEventBytes(event) {
  try {
    return JSON.stringify(event).length;
  } catch {
    return 0;
  }
}
