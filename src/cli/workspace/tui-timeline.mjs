export const DEFAULT_MAX_TIMELINE_EVENTS = 4000;
export const DEFAULT_TIMELINE_PERSIST_DEBOUNCE_MS = 250;

export function createTuiTimelineRegistry({
  maxEventsPerTimeline = DEFAULT_MAX_TIMELINE_EVENTS,
  persistDebounceMs = DEFAULT_TIMELINE_PERSIST_DEBOUNCE_MS,
  onPersistTimeline = null,
} = {}) {
  const timelines = new Map();

  return {
    ensure(key, { events = null } = {}) {
      let timeline = timelines.get(key);
      if (!timeline) {
        timeline = createTuiTimelineInstance({
          key,
          maxEvents: maxEventsPerTimeline,
          persistDebounceMs,
          onPersist: onPersistTimeline,
        });
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
    flush(key, reason = "manual") {
      return this.get(key)?.flushPersist(reason) ?? false;
    },
    flushAll(reason = "manual") {
      let flushed = 0;
      for (const timeline of timelines.values()) {
        if (timeline.flushPersist(reason)) flushed += 1;
      }
      return flushed;
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

export function createTuiTimelineInstance({
  key,
  maxEvents = DEFAULT_MAX_TIMELINE_EVENTS,
  persistDebounceMs = DEFAULT_TIMELINE_PERSIST_DEBOUNCE_MS,
  onPersist = null,
} = {}) {
  let events = [];
  let hydrated = false;
  let dirty = false;
  let lastAccessedAt = Date.now();
  let lastUpdatedAt = null;
  let lastPersistedAt = null;
  let estimatedBytes = 0;
  let persistTimer = null;

  return {
    key,
    apply(method, args, { at = Date.now(), persist = true } = {}) {
      touch();
      const event = { method, args, at };
      events.push(event);
      trimToBudget();
      dirty = true;
      lastUpdatedAt = at;
      if (persist) schedulePersist("debounce");
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
    clear({ flush = true } = {}) {
      touch();
      events = [];
      dirty = true;
      lastUpdatedAt = Date.now();
      estimatedBytes = 0;
      if (flush) this.flushPersist("clear");
      else schedulePersist("debounce");
    },
    replayTo(ui) {
      touch();
      for (const event of events) applyRenderEvent(ui, event);
      return events.length;
    },
    flushPersist(reason = "manual") {
      clearPersistTimer();
      if (!dirty || typeof onPersist !== "function") return false;
      onPersist({ key, events: this.getEvents(), reason, timeline: this.getMetadata() });
      dirty = false;
      lastPersistedAt = Date.now();
      return true;
    },
    getEvents() {
      touch();
      return events.map((event) => ({ method: event.method, args: event.args, at: event.at ?? null }));
    },
    getEventCount() {
      return events.length;
    },
    markPersisted() {
      clearPersistTimer();
      dirty = false;
      lastPersistedAt = Date.now();
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
        lastPersistedAt,
        estimatedBytes,
        persistScheduled: Boolean(persistTimer),
      };
    },
  };

  function schedulePersist(reason) {
    if (typeof onPersist !== "function") return;
    clearPersistTimer();
    persistTimer = setTimeout(() => {
      persistTimer = null;
      if (!dirty) return;
      onPersist({ key, events: events.map((event) => ({ method: event.method, args: event.args, at: event.at ?? null })), reason, timeline: buildMetadata() });
      dirty = false;
      lastPersistedAt = Date.now();
    }, Math.max(0, persistDebounceMs));
    persistTimer.unref?.();
  }

  function clearPersistTimer() {
    if (!persistTimer) return;
    clearTimeout(persistTimer);
    persistTimer = null;
  }

  function trimToBudget() {
    if (events.length > maxEvents) events.splice(0, events.length - maxEvents);
    estimatedBytes = estimateEventsBytes(events);
  }

  function touch() {
    lastAccessedAt = Date.now();
  }

  function buildMetadata() {
    return {
      key,
      eventCount: events.length,
      maxEvents,
      hydrated,
      dirty,
      lastAccessedAt,
      lastUpdatedAt,
      lastPersistedAt,
      estimatedBytes,
      persistScheduled: Boolean(persistTimer),
    };
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
