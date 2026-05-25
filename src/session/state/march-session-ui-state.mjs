import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getMarchSessionStatePath, loadMarchSessionState, normalizeSessionId } from "./march-session-state.mjs";

export const TUI_SESSION_TIMELINE_VERSION = 1;

export function getTuiSessionUiStateRoot(projectMarchDir) {
  return join(projectMarchDir, "ui", "tui", "sessions");
}

export function getTuiSessionTimelinePath(projectMarchDir, sessionId) {
  return join(getTuiSessionUiStateRoot(projectMarchDir), normalizeSessionId(sessionId), "timeline.json");
}

export function loadMarchSessionRenderTimeline({ projectMarchDir, sessionId }) {
  const tuiTimeline = loadTuiRenderTimeline({ projectMarchDir, sessionId });
  if (tuiTimeline) return tuiTimeline;

  const legacyTimeline = loadLegacyCoreRenderTimeline({ projectMarchDir, sessionId });
  if (legacyTimeline) return legacyTimeline;

  const stored = loadMarchSessionState({ projectMarchDir, sessionId });
  if (!stored) return null;
  return {
    path: stored.path,
    renderTimeline: renderTimelineFromTurns(stored.state.turns ?? []),
    source: "core-turns",
  };
}

export function saveMarchSessionRenderTimeline({ projectMarchDir, sessionId, renderTimeline }) {
  if (!sessionId) throw new Error("March session id is required");
  const state = {
    version: TUI_SESSION_TIMELINE_VERSION,
    savedAt: new Date().toISOString(),
    sessionId,
    renderTimeline: normalizeSessionRenderTimeline(renderTimeline),
  };
  const path = getTuiSessionTimelinePath(projectMarchDir, sessionId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), "utf8");
  return { path, renderTimeline: state.renderTimeline, state };
}

export function normalizeSessionRenderTimeline(events) {
  if (!Array.isArray(events)) return [];
  return events
    .filter((event) => typeof event?.method === "string" && Array.isArray(event.args))
    .map((event) => ({ method: event.method, args: event.args, at: event.at ?? null }));
}

function loadTuiRenderTimeline({ projectMarchDir, sessionId }) {
  try {
    const path = getTuiSessionTimelinePath(projectMarchDir, sessionId);
    if (!existsSync(path)) return null;
    const state = JSON.parse(readFileSync(path, "utf8"));
    if (state?.version !== TUI_SESSION_TIMELINE_VERSION) return null;
    return { path, renderTimeline: normalizeSessionRenderTimeline(state.renderTimeline), source: "tui" };
  } catch {
    return null;
  }
}

function loadLegacyCoreRenderTimeline({ projectMarchDir, sessionId }) {
  try {
    const path = getMarchSessionStatePath(projectMarchDir, sessionId);
    if (!existsSync(path)) return null;
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const rawTimeline = normalizeSessionRenderTimeline(raw.renderTimeline);
    if (!raw.renderTimelineUpdatedAt && rawTimeline.length === 0) return null;
    return { path, renderTimeline: rawTimeline, source: "legacy-core-render" };
  } catch {
    return null;
  }
}

function renderTimelineFromTurns(turns) {
  return turns.flatMap((turn) => {
    const events = [];
    if (turn.userMessage) events.push({ method: "writeln", args: [turn.userMessage], at: null });
    if (turn.assistantMessage) {
      events.push({ method: "turnStart", args: [], at: null });
      events.push({ method: "textDelta", args: [turn.assistantMessage], at: null });
      events.push({ method: "assistantReplyEnd", args: [], at: null });
      events.push({ method: "turnEnd", args: [], at: null });
    }
    return events;
  });
}
