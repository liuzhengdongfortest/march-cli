import { resolve } from "node:path";
import { listPiSessionInfos } from "../session/pi-manager.mjs";
import { getTurnUserContent } from "../session/turn-record.mjs";
import { listMarchSessionStates } from "../session/state/march-session-state.mjs";
import { listRegisteredProjects } from "./project-registry.mjs";

export async function listWorkspaceSessions({ stateRoot, currentProjectId = null, listSessions = listPiSessionInfos }) {
  const projects = listRegisteredProjects({ stateRoot });
  const entries = [];
  for (const project of projects) {
    const projectMarchDir = resolve(project.rootPath, ".march");
    let sessions = [];
    try {
      sessions = await listSessions({ cwd: project.rootPath, projectMarchDir });
      sessions = mergeMarchSessionStates({ projectMarchDir, backendSessions: sessions });
    } catch {
      sessions = [];
    }
    entries.push({
      ...project,
      current: project.projectId === currentProjectId,
      sessions,
      sessionCount: sessions.length,
    });
  }
  return entries;
}

export function buildWorkspaceSessionSelectItems(projects, currentSessionId = null) {
  const items = [];
  for (const project of projects) {
    if (project.sessions.length === 0) {
      items.push({
        value: `${project.projectId}:new`,
        label: `${project.displayName} / + new session`,
        description: project.current ? "current project" : project.rootPath,
        project,
        session: null,
        kind: "new-session",
      });
      continue;
    }
    for (const session of project.sessions) {
      const current = project.current && session.id === currentSessionId;
      items.push({
        value: `${project.projectId}:${session.id}`,
        label: `${project.displayName} / ${session.name || session.firstMessage || session.id}`,
        description: `${current ? "current · " : ""}${formatWorkspaceSessionTime(session.savedAt)} · ${project.rootPath}`,
        project,
        session,
        kind: "session",
      });
    }
  }
  return items.sort(compareWorkspaceItems);
}

export function workspaceSessionSearchText(item) {
  const session = item?.session;
  const project = item?.project;
  return [item?.label, item?.description, project?.displayName, project?.rootPath, session?.id, session?.name, session?.firstMessage]
    .filter(Boolean)
    .join(" ");
}

function compareWorkspaceItems(a, b) {
  const aCurrent = a.project?.current ? 1 : 0;
  const bCurrent = b.project?.current ? 1 : 0;
  if (aCurrent !== bCurrent) return bCurrent - aCurrent;
  const aTime = a.session?.savedAt || a.project?.lastOpenedAt || "";
  const bTime = b.session?.savedAt || b.project?.lastOpenedAt || "";
  return String(bTime).localeCompare(String(aTime));
}

function formatWorkspaceSessionTime(value) {
  if (!value) return "no saved time";
  return String(value).slice(0, 16).replace("T", " ");
}

function mergeMarchSessionStates({ projectMarchDir, backendSessions }) {
  const backendById = new Map(backendSessions.map((session) => [session.id, session]));
  const backendByPath = new Map(backendSessions.map((session) => [session.path, session]));
  const marchSessions = listMarchSessionStates({ projectMarchDir }).map(({ state }) => {
    const backend = state.backend?.type === "pi"
      ? backendById.get(state.backend.sessionId) ?? backendByPath.get(state.backend.sessionFile)
      : null;
    return {
      id: state.sessionId,
      path: state.backend?.sessionFile ?? backend?.path ?? null,
      savedAt: state.savedAt,
      createdAt: backend?.createdAt ?? "",
      cwd: state.cwd,
      name: state.sessionName || backend?.name || "",
      turnCount: state.turns?.length ?? backend?.turnCount ?? 0,
      firstMessage: getTurnUserContent(state.turns?.[0]) || backend?.firstMessage || "",
      parentSessionPath: backend?.parentSessionPath ?? null,
      backend,
    };
  });
  const seenBackendIds = new Set(marchSessions.map((session) => session.backend?.id).filter(Boolean));
  const legacyBackendSessions = backendSessions.filter((session) => !seenBackendIds.has(session.id));
  return [...marchSessions, ...legacyBackendSessions];
}