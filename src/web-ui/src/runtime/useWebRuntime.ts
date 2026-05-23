import { useEffect, useRef, useState } from "react";
import { mockWebUiModel } from "../mockData";
import type { MarchTimelineEvent, WebUiModel } from "../model";
import { applyRuntimeEvent } from "./runtimeTimeline";
import { connectRuntimeEvents, createRuntimeSession, fetchFsList, fetchFsRoots, fetchRuntimeSnapshot, submitRuntimeTurn } from "./client";
import type { FsEntry } from "./client";

export type WebRuntimeState = {
  model: WebUiModel;
  connected: boolean;
  running: boolean;
  error: string | null;
  fsEntries: FsEntry[];
  fsPath: string | null;
  openSession: (sessionId: string) => Promise<void>;
  createSession: (workspacePath: string) => Promise<void>;
  browseRoots: () => Promise<void>;
  browsePath: (path: string) => Promise<void>;
  submitPrompt: (prompt: string) => Promise<void>;
};

export function useWebRuntime(): WebRuntimeState {
  const [model, setModel] = useState<WebUiModel>(mockWebUiModel);
  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fsEntries, setFsEntries] = useState<FsEntry[]>([]);
  const [fsPath, setFsPath] = useState<string | null>(null);
  const activeSessionId = model.activeSessionId ?? null;
  const timelineCache = useRef(new Map<string, MarchTimelineEvent[]>());

  useEffect(() => {
    let mounted = true;
    fetchRuntimeSnapshot()
      .then((snapshot) => {
        if (!mounted) return;
        setModel(snapshot);
        setConnected(true);
      })
      .catch(() => setConnected(false));
    fetchFsRoots().then((roots) => mounted && setFsEntries(roots)).catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!activeSessionId) return undefined;
    const disconnect = connectRuntimeEvents(
      activeSessionId,
      (event) => {
        setConnected(true);
        setModel((current) => {
          const next = updateTimelineEvents(current, (events) => applyRuntimeEvent(events, event));
          rememberTimeline(next, timelineCache.current);
          return next;
        });
      },
      () => setConnected(false),
    );
    return disconnect;
  }, [activeSessionId]);

  async function openSession(sessionId: string) {
    setError(null);
    const snapshot = await fetchRuntimeSnapshot(sessionId);
    setModel(restoreCachedTimeline(snapshot, timelineCache.current));
  }

  async function createSession(workspacePath: string) {
    setRunning(true);
    setError(null);
    try {
      const result = await createRuntimeSession(workspacePath);
      setModel(result.snapshot);
      rememberTimeline(result.snapshot, timelineCache.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function browseRoots() {
    setFsPath(null);
    setFsEntries(await fetchFsRoots());
  }

  async function browsePath(path: string) {
    setFsPath(path);
    setFsEntries(await fetchFsList(path));
  }

  async function submitPrompt(prompt: string) {
    if (!activeSessionId) {
      setError("Choose a workspace before sending a message");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      await submitRuntimeTurn(activeSessionId, prompt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setModel((current) => {
        const next = updateTimelineEvents(current, (events) => [
          ...events,
          { id: `client-error:${Date.now()}`, type: "error", message },
        ]);
        rememberTimeline(next, timelineCache.current);
        return next;
      });
    } finally {
      setRunning(false);
    }
  }

  return { model, connected, running, error, fsEntries, fsPath, openSession, createSession, browseRoots, browsePath, submitPrompt };
}

function restoreCachedTimeline(model: WebUiModel, cache: Map<string, MarchTimelineEvent[]>): WebUiModel {
  const activeSessionId = model.activeSessionId;
  const cached = activeSessionId ? cache.get(activeSessionId) : null;
  return cached ? { ...model, timeline: { ...model.timeline, events: cached } } : model;
}

function rememberTimeline(model: WebUiModel, cache: Map<string, MarchTimelineEvent[]>) {
  if (model.activeSessionId) cache.set(model.activeSessionId, model.timeline.events);
}

function updateTimelineEvents(model: WebUiModel, update: (events: MarchTimelineEvent[]) => MarchTimelineEvent[]): WebUiModel {
  return { ...model, timeline: { ...model.timeline, events: update(model.timeline.events) } };
}
