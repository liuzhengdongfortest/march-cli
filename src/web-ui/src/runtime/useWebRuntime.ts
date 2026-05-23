import { useEffect, useState } from "react";
import { mockWebUiModel } from "../mockData";
import type { MarchTimelineEvent, WebUiModel } from "../model";
import { applyRuntimeEvent } from "./runtimeTimeline";
import { connectRuntimeEvents, fetchRuntimeSnapshot, submitRuntimeTurn } from "./client";

export type WebRuntimeState = {
  model: WebUiModel;
  connected: boolean;
  running: boolean;
  error: string | null;
  submitPrompt: (prompt: string) => Promise<void>;
};

export function useWebRuntime(): WebRuntimeState {
  const [model, setModel] = useState<WebUiModel>(mockWebUiModel);
  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchRuntimeSnapshot()
      .then((snapshot) => {
        if (!mounted) return;
        setModel(snapshot);
        setConnected(true);
      })
      .catch(() => setConnected(false));
    const disconnect = connectRuntimeEvents(
      (event) => {
        setConnected(true);
        setModel((current) => updateTimelineEvents(current, (events) => applyRuntimeEvent(events, event)));
      },
      () => setConnected(false),
    );
    return () => {
      mounted = false;
      disconnect();
    };
  }, []);

  async function submitPrompt(prompt: string) {
    setRunning(true);
    setError(null);
    try {
      await submitRuntimeTurn(prompt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setModel((current) => updateTimelineEvents(current, (events) => [
        ...events,
        { id: `client-error:${Date.now()}`, type: "error", message },
      ]));
    } finally {
      setRunning(false);
    }
  }

  return { model, connected, running, error, submitPrompt };
}

function updateTimelineEvents(model: WebUiModel, update: (events: MarchTimelineEvent[]) => MarchTimelineEvent[]): WebUiModel {
  return { ...model, timeline: { ...model.timeline, events: update(model.timeline.events) } };
}
