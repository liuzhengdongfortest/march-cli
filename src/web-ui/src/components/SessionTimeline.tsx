import { normalizeTimelineEvents } from "../timelineAdapter";
import type { WebUiModel } from "../model";
import { TimelineList } from "./timeline/TimelineList";

export type SessionTimelineProps = {
  timeline: WebUiModel["timeline"];
};

export function SessionTimeline({ timeline }: SessionTimelineProps) {
  const items = normalizeTimelineEvents(timeline.events);

  return (
    <main className="timeline" aria-label="Agent timeline">
      <div className="main-header">
        <span>Session</span>
        <button className="header-button" type="button">Share</button>
      </div>
      <div className="timeline-scroll">
        <div className="session-title">
          <h1>{timeline.title}</h1>
          <span>{timeline.meta}</span>
        </div>
        <TimelineList items={items} />
      </div>
    </main>
  );
}
