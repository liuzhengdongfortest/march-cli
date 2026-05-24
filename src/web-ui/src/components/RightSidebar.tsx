import { useState } from "react";
import type { ActivityEvent, ProviderQuotaSnapshot, SessionSummary } from "../model";
import type { FsEntry } from "../runtime/client";

type RightSidebarProps = {
  sessions: SessionSummary[];
  activity: ActivityEvent[];
  fsEntries: FsEntry[];
  fsPath: string | null;
  providerQuota?: ProviderQuotaSnapshot | null;
  running: boolean;
  onOpenSession: (sessionId: string) => Promise<void>;
  onCreateSession: (workspacePath: string) => Promise<void>;
  onBrowseRoots: () => Promise<void>;
  onBrowsePath: (path: string) => Promise<void>;
};

export function RightSidebar(props: RightSidebarProps) {
  const { sessions, activity, fsEntries, fsPath, providerQuota, running } = props;
  const { onOpenSession, onCreateSession, onBrowseRoots, onBrowsePath } = props;
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

        {providerQuota ? <ProviderQuotaCard quota={providerQuota} /> : null}

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

function ProviderQuotaCard({ quota }: { quota: ProviderQuotaSnapshot }) {
  return (
    <div className="provider-quota" aria-label="Provider quota">
      <div className="provider-quota-header">
        <span>{quota.label}</span>
        <time>{quota.providerId}</time>
      </div>
      {quota.limits.flatMap((limit) => limit.windows.map((window) => {
        const left = Math.round(window.remainingPercent);
        return (
          <div key={`${limit.id}:${window.id}`} className="quota-row">
            <div className="quota-row-main">
              <span>{formatQuotaLabel(window.label)}</span>
              <strong>{left}% left</strong>
            </div>
            <div className="quota-bar" aria-label={`${left}% quota left`}>
              <span style={{ width: `${Math.max(0, Math.min(100, left))}%` }} />
            </div>
            <em>{formatReset(window.resetsAt)}</em>
          </div>
        );
      }))}
    </div>
  );
}

function formatQuotaLabel(label: string) {
  return label === "weekly" ? "Weekly limit:" : `${label} limit:`;
}

function formatReset(resetsAt?: string | null) {
  if (!resetsAt) return "reset unknown";
  const date = new Date(resetsAt);
  if (Number.isNaN(date.getTime())) return "reset unknown";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()];
  return `resets ${hours}:${minutes} on ${date.getDate()} ${month}`;
}
