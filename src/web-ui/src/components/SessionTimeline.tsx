import type { TimelineEvent, WebUiModel } from "../model";

type SessionTimelineProps = {
  timeline: WebUiModel["timeline"];
};

export function SessionTimeline({ timeline }: SessionTimelineProps) {
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
        {timeline.events.map((event) => <TimelineItem key={event.id} event={event} />)}
      </div>
    </main>
  );
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  if (event.kind === "tool") {
    return (
      <article className="message-row assistant-turn">
        <div className="agent-dot march">M</div>
        <div className="message-body"><ToolRow event={event} /></div>
      </article>
    );
  }

  if (event.kind === "diff") {
    return (
      <article className="message-row assistant-turn">
        <div className="agent-dot march">M</div>
        <div className="message-body"><DiffInline event={event} /></div>
      </article>
    );
  }

  return (
    <article className={`message-row ${event.actor === "user" ? "user-turn" : "assistant-turn"}`}>
      <div className={event.actor === "user" ? "agent-dot" : "agent-dot march"}>
        {event.actor === "user" ? "U" : "M"}
      </div>
      <div className="message-body"><p>{event.text}</p></div>
    </article>
  );
}

function ToolRow({ event }: { event: Extract<TimelineEvent, { kind: "tool" }> }) {
  return (
    <div className="tool-row">
      <span className="tool-kind">{event.action}</span>
      <strong>{event.target}</strong>
      <em>{event.status}</em>
    </div>
  );
}

function DiffInline({ event }: { event: Extract<TimelineEvent, { kind: "diff" }> }) {
  return (
    <div className="diff-inline">
      {event.lines.map((line) => (
        <div key={`${line.kind}:${line.text}`} className={`diff-line ${line.kind}`}>{line.text}</div>
      ))}
    </div>
  );
}
