import { createTuiTimelineProjection } from "./tui-timeline-projection.mjs";

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
    getBlocks(key) {
      return this.get(key)?.getBlocks() ?? [];
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
  const projection = createTuiTimelineProjection();
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
      projection.apply(event);
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
      rebuildProjection();
      hydrated = true;
      dirty = false;
      lastUpdatedAt = events.at(-1)?.at ?? null;
      updateEstimatedBytes();
      return true;
    },
    clear({ flush = true } = {}) {
      touch();
      events = [];
      projection.clear();
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
      return cloneEvents(events);
    },
    getBlocks() {
      touch();
      return projection.getBlocks();
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
      return buildMetadata();
    },
  };

  function schedulePersist(reason) {
    if (typeof onPersist !== "function") return;
    clearPersistTimer();
    persistTimer = setTimeout(() => {
      persistTimer = null;
      if (!dirty) return;
      onPersist({ key, events: cloneEvents(events), reason, timeline: buildMetadata() });
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
    if (events.length > maxEvents) {
      events.splice(0, events.length - maxEvents);
      rebuildProjection();
    }
    updateEstimatedBytes();
  }

  function rebuildProjection() {
    projection.rebuild(events);
  }

  function updateEstimatedBytes() {
    estimatedBytes = estimateJsonBytes(events) + estimateJsonBytes(projection.getBlocks());
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
      ...projection.getMetadata(),
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

function cloneEvents(items) {
  return items.map((event) => ({ method: event.method, args: event.args, at: event.at ?? null }));
}

function estimateJsonBytes(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}
