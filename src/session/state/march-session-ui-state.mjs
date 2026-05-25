import { existsSync, readFileSync } from "node:fs";
import { getMarchSessionStatePath, loadMarchSessionState, saveMarchSessionStateValue } from "./march-session-state.mjs";

export function loadMarchSessionRenderTimeline({ projectMarchDir, sessionId }) {
  const persistedRender = readPersistedRenderTimelineInfo({ projectMarchDir, sessionId });
  const stored = loadMarchSessionState({ projectMarchDir, sessionId });
  if (!stored) return null;
  const renderTimeline = normalizeSessionRenderTimeline(stored.state.renderTimeline);
  return {
    path: stored.path,
    renderTimeline: persistedRender.hasUiOwnedTimeline ? renderTimeline : renderTimelineFromTurns(stored.state.turns ?? []),
  };
}

export function saveMarchSessionRenderTimeline({ projectMarchDir, sessionId, renderTimeline }) {
  const stored = loadMarchSessionState({ projectMarchDir, sessionId });
  if (!stored) return null;
  return saveMarchSessionStateValue({
    projectMarchDir,
    sessionId,
    state: {
      ...stored.state,
      renderTimeline: normalizeSessionRenderTimeline(renderTimeline),
      renderTimelineUpdatedAt: new Date().toISOString(),
    },
  });
}

export function normalizeSessionRenderTimeline(events) {
  if (!Array.isArray(events)) return [];
  return events
    .filter((event) => typeof event?.method === "string" && Array.isArray(event.args))
    .map((event) => ({ method: event.method, args: event.args, at: event.at ?? null }));
}

function readPersistedRenderTimelineInfo({ projectMarchDir, sessionId }) {
  try {
    const path = getMarchSessionStatePath(projectMarchDir, sessionId);
    if (!existsSync(path)) return { hasUiOwnedTimeline: false };
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const rawTimeline = normalizeSessionRenderTimeline(raw.renderTimeline);
    return { hasUiOwnedTimeline: Boolean(raw.renderTimelineUpdatedAt) || rawTimeline.length > 0 };
  } catch {
    return { hasUiOwnedTimeline: false };
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
