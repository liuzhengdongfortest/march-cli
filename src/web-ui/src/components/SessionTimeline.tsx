import { normalizeTimelineEvents } from "../timelineAdapter";
import type { WebUiModel } from "../model";
import { TimelineList } from "./timeline/TimelineList";

export type SessionTimelineProps = {
  timeline: WebUiModel["timeline"];
  connected: boolean;
  error: string | null;
};

export function SessionTimeline({ timeline, connected, error }: SessionTimelineProps) {
  const items = normalizeTimelineEvents(timeline.events);

  return (
    <main className="timeline" aria-label="Agent timeline">
      <div className="main-header">
        <span>Session</span>
        <span className={connected ? "runtime-pill connected" : "runtime-pill"}>
          {connected ? "runner" : "mock"}
        </span>
      </div>
      <div className="timeline-scroll">
        <div className="session-title">
          <h1>{timeline.title}</h1>
          <span>{error ?? timeline.meta}</span>
        </div>
        <TimelineList items={items} />
      </div>
    </main>
  );
}
