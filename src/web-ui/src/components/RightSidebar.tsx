import { useState } from "react";
import type { ActivityEvent, SessionSummary } from "../model";
import type { FsEntry } from "../runtime/client";

type RightSidebarProps = {
  sessions: SessionSummary[];
  activity: ActivityEvent[];
  fsEntries: FsEntry[];
  fsPath: string | null;
  running: boolean;
  onOpenSession: (sessionId: string) => Promise<void>;
  onCreateSession: (workspacePath: string) => Promise<void>;
  onBrowseRoots: () => Promise<void>;
  onBrowsePath: (path: string) => Promise<void>;
};

export function RightSidebar({ sessions, activity, fsEntries, fsPath, running, onOpenSession, onCreateSession, onBrowseRoots, onBrowsePath }: RightSidebarProps) {
  const [workspacePath, setWorkspacePath] = useState("");
  const canCreate = workspacePath.trim().length > 0 && !running;

  async function createFromPath(path = workspacePath) {
    const nextPath = path.trim();
    if (!nextPath || running) return;
    await onCreateSession(nextPath);
    setWorkspacePath("");
  }

  return (
    <aside className="panel right-panel" aria-label="Sessions">
      <div className="right-header">会话</div>
      <div className="right-body">
        <div className="workspace-picker" aria-label="Workspace picker">
          <label htmlFor="workspace-path">Workspace</label>
          <div className="workspace-input-row">
            <input
              id="workspace-path"
              value={workspacePath}
              onChange={(event) => setWorkspacePath(event.target.value)}
              placeholder="Paste or browse a folder path"
            />
            <button type="button" disabled={!canCreate} onClick={() => createFromPath()}>Open</button>
          </div>
          <div className="workspace-path">{fsPath ?? "Roots"}</div>
          <button type="button" className="fs-row" onClick={onBrowseRoots}>↖ Roots</button>
          {fsEntries.map((entry) => (
            <div key={entry.path} className="fs-entry-row">
              <button type="button" onClick={() => onBrowsePath(entry.path)}>{entry.name}</button>
              <button type="button" onClick={() => createFromPath(entry.path)}>Open</button>
            </div>
          ))}
        </div>

        <div className="right-divider">Sessions</div>
        {sessions.map((session) => (
          <button key={session.id} className={session.active ? "session-row active" : "session-row"} type="button" onClick={() => onOpenSession(session.id)}>
            <span>{session.title}</span>
            <time>{session.workspacePath ?? session.time}</time>
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
