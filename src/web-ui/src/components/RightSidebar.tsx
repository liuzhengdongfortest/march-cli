import type { ActivityEvent, SessionSummary } from "../model";

type RightSidebarProps = {
  sessions: SessionSummary[];
  activity: ActivityEvent[];
};

export function RightSidebar({ sessions, activity }: RightSidebarProps) {
  return (
    <aside className="panel right-panel" aria-label="Sessions">
      <div className="right-header">会话</div>
      <div className="right-body">
        {sessions.map((session) => (
          <button key={session.id} className={session.active ? "session-row active" : "session-row"} type="button">
            <span>{session.title}</span>
            <time>{session.time}</time>
          </button>
        ))}
        <div className="right-divider">Activity</div>
        {activity.map((event) => (
          <button key={event.id} className="activity-row" type="button">
            <span>{event.action}</span>
            <time>{event.time}</time>
          </button>
        ))}
      </div>
    </aside>
  );
}
