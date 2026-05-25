import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { brightBlack } from "../tui/ui-theme.mjs";
import { registerProject, listRegisteredProjects } from "../../workspace/project-registry.mjs";
import { buildWorkspaceSessionSelectItems, listWorkspaceSessions, workspaceSessionSearchText } from "../../workspace/session-index.mjs";
import { SessionControllerLeaseConflictError } from "../../session/control/controller-lease.mjs";

export const WORKSPACE_SLASH_COMMANDS = [
  {
    metadata: [
      { name: "project", description: "List registered projects" },
      { name: "project add", helpSyntax: "project add <path>", description: "Register a project root" },
    ],
    match: (trimmed) => {
      const parsed = parseProjectCommand(trimmed);
      return parsed.type === "none" ? null : { parsed };
    },
    run: async (ctx, command) => writeLines(ctx.ui, await handleProjectCommand(command, ctx)),
  },
  {
    metadata: [{ name: "session", description: "Open workspace session selector" }],
    match: (trimmed) => trimmed === "/session" ? { parsed: { type: "session" } } : null,
    run: handleSessionCommand,
  },
];

export function parseProjectCommand(trimmed) {
  if (trimmed === "/project" || trimmed === "/project list") return { type: "list" };
  if (trimmed.startsWith("/project add ")) return { type: "add", path: trimmed.slice("/project add ".length).trim() };
  return { type: "none" };
}

export async function handleProjectCommand(command, { stateRoot }) {
  if (!stateRoot) return ["Error: workspace registry is not available."];
  if (command.type === "add") {
    const rootPath = resolve(command.path);
    if (!existsSync(rootPath)) return [`Error: project path does not exist: ${rootPath}`];
    const project = registerProject({ stateRoot, rootPath });
    return [`Registered project: ${project.displayName}`, brightBlack(project.rootPath)];
  }

  const projects = listRegisteredProjects({ stateRoot });
  if (projects.length === 0) return ["No registered projects."];
  return ["Registered projects:", ...projects.map((project) => `- ${project.displayName}  ${brightBlack(project.rootPath)}`)];
}

export async function handleSessionCommand({ stateRoot, currentProjectId, runner, workspaceSupervisor, workspaceOutputRouter, ui }) {
  if (!stateRoot) {
    ui.writeln("Session selector is not available: workspace registry is missing.");
    return { handled: true };
  }
  const projects = await listWorkspaceSessions({ stateRoot, currentProjectId });
  const currentSessionId = runner.getSessionStats?.().sessionId ?? null;
  const runtimeSummaries = workspaceSupervisor?.getRuntimeSummaries?.() ?? [];
  const items = annotateWorkspaceItems(buildWorkspaceSessionSelectItems(projects, currentSessionId), runtimeSummaries);
  if (items.length === 0) {
    ui.writeln("No registered projects. Start March in a project or run /project add <path>.");
    return { handled: true };
  }
  if (!ui.selectList) {
    ui.writeln("Session selector is only available in TUI.");
    return { handled: true };
  }
  const selectedIndex = Math.max(0, items.findIndex((item) => item.project.current && item.session?.id === currentSessionId));
  const item = await ui.selectList({
    items,
    selectedIndex,
    width: 90,
    suppressInitialConfirm: true,
    searchable: true,
    getSearchText: workspaceSessionSearchText,
  });
  if (!item) {
    ui.writeln("Session unchanged.");
    return { handled: true };
  }
  if (!item.session) {
    if (!workspaceSupervisor?.startNewWorkspaceSession) {
      ui.writeln("New session creation requires the workspace supervisor.");
      return { handled: true };
    }
    try {
      const { result } = await workspaceSupervisor.startNewWorkspaceSession(item.project);
      ui.writeln(`Created session: ${item.project.displayName} / ${result?.sessionId ?? "new session"}`);
      return { handled: true, refreshContextTokens: true, activeChanged: true };
    } catch (err) {
      ui.writeln(`Error: ${err.message}`);
      return { handled: true };
    }
  }
  if (workspaceSupervisor) {
    try {
      await workspaceSupervisor.activateWorkspaceSession({ project: item.project, session: item.session });
      ctxRenderActiveSession({ workspaceOutputRouter, projectId: item.project.projectId, sessionId: item.session.id });
      return { handled: true, refreshContextTokens: true, activeChanged: true };
    } catch (err) {
      if (err instanceof SessionControllerLeaseConflictError) {
        return await handleSessionControllerConflict({ err, item, workspaceSupervisor, workspaceOutputRouter, ui });
      }
      ui.writeln(`Error: ${err.message}`);
      return { handled: true };
    }
  }
  ui.writeln("Workspace session activation requires the workspace supervisor.");
  return { handled: true };
}

async function handleSessionControllerConflict({ err, item, workspaceSupervisor, workspaceOutputRouter, ui }) {
  ui.writeln(err.message);
  if (!ui.selectList) return { handled: true };
  const choice = await ui.selectList({
    items: [
      { value: "view-only", label: "View only", description: "inspect this session without taking control" },
      { value: "take-over", label: "Take over control", description: "steal the controller lease for this session" },
      { value: "cancel", label: "Cancel", description: "leave current controller unchanged" },
    ],
    selectedIndex: 0,
    width: 70,
    suppressInitialConfirm: true,
  });
  if (choice?.value === "view-only") {
    try {
      await workspaceSupervisor.viewWorkspaceSession({ project: item.project, session: item.session });
      ctxRenderActiveSession({ workspaceOutputRouter, projectId: item.project.projectId, sessionId: item.session.id });
      ui.writeln(`Viewing session: ${item.project.displayName} / ${item.session.name || item.session.id}`);
      ui.writeln("View-only mode: prompts are disabled until you take over control.");
      return { handled: true, refreshContextTokens: true, activeChanged: true };
    } catch (viewErr) {
      ui.writeln(`Error: ${viewErr.message}`);
      return { handled: true };
    }
  }
  if (choice?.value !== "take-over") {
    ui.writeln("Session unchanged.");
    return { handled: true };
  }
  try {
    await workspaceSupervisor.activateWorkspaceSession({ project: item.project, session: item.session, force: true });
    ctxRenderActiveSession({ workspaceOutputRouter, projectId: item.project.projectId, sessionId: item.session.id });
    ui.writeln(`Took over session: ${item.project.displayName} / ${item.session.name || item.session.id}`);
    return { handled: true, refreshContextTokens: true, activeChanged: true };
  } catch (takeoverErr) {
    ui.writeln(`Error: ${takeoverErr.message}`);
    return { handled: true };
  }
}

function annotateWorkspaceItems(items, runtimeSummaries) {
  if (!runtimeSummaries.length) return items;
  const running = new Set(runtimeSummaries.filter((runtime) => runtime.running).map((runtime) => `${runtime.projectId}:${runtime.sessionId}`));
  return items.map((item) => {
    if (!item.session) return item;
    if (!running.has(`${item.project.projectId}:${item.session.id}`)) return item;
    return { ...item, description: `running · ${item.description}` };
  });
}

function ctxRenderActiveSession({ workspaceOutputRouter, projectId, sessionId }) {
  return workspaceOutputRouter?.getRenderEventCount?.(projectId, sessionId) ?? 0;
}

function writeLines(ui, lines) {
  for (const line of lines) ui.writeln(line);
  return { handled: true };
}
