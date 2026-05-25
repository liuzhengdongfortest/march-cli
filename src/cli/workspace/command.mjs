import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { brightBlack } from "../tui/ui-theme.mjs";
import { registerProject, listRegisteredProjects } from "../../workspace/project-registry.mjs";
import { buildWorkspaceSessionSelectItems, listWorkspaceSessions, workspaceSessionSearchText } from "../../workspace/session-index.mjs";
import { resumePiSessionById } from "../session/pi-session-switch-command.mjs";
import { loadPiSessionTranscriptTurns } from "../../session/transcript.mjs";

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
    metadata: [{ name: "switch", description: "Open cross-project session switcher" }],
    match: (trimmed) => trimmed === "/switch" ? { parsed: { type: "switch" } } : null,
    run: handleSwitchCommand,
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

export async function handleSwitchCommand({ stateRoot, currentProjectId, projectMarchDir, runner, workspaceSupervisor, ui }) {
  if (!stateRoot) {
    ui.writeln("Session switcher is not available: workspace registry is missing.");
    return { handled: true };
  }
  const projects = await listWorkspaceSessions({ stateRoot, currentProjectId });
  const currentSessionId = runner.getSessionStats?.().sessionId ?? null;
  const items = buildWorkspaceSessionSelectItems(projects, currentSessionId);
  if (items.length === 0) {
    ui.writeln("No registered projects. Start March in a project or run /project add <path>.");
    return { handled: true };
  }
  if (!ui.selectList) {
    ui.writeln("Session switcher is only available in TUI.");
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
    ui.writeln("New session creation from switcher is not active yet.");
    return { handled: true };
  }
  if (workspaceSupervisor) {
    try {
      await workspaceSupervisor.activateWorkspaceSession({ project: item.project, session: item.session });
      restoreTranscriptFromSession(item.session, ui);
      ui.writeln(`Switched to session: ${item.project.displayName} / ${item.session.name || item.session.id}`);
      return { handled: true, refreshContextTokens: true, activeChanged: true };
    } catch (err) {
      ui.writeln(`Error: ${err.message}`);
      return { handled: true };
    }
  }
  if (!item.project.current) {
    ui.writeln(`Project switch target indexed: ${item.project.displayName}`);
    ui.writeln(brightBlack("Cross-project attach requires the workspace supervisor."));
    return { handled: true };
  }
  const sessions = projects.find((project) => project.current)?.sessions ?? [];
  const lines = await resumePiSessionById(item.session.id, { runner, sessions, projectMarchDir });
  if (isResumeSuccess(lines)) restoreTranscriptFromSession(item.session, ui);
  for (const line of lines) ui.writeln(line);
  return { handled: true, refreshContextTokens: isResumeSuccess(lines) };
}

function restoreTranscriptFromSession(session, ui) {
  if (typeof ui.restoreTranscript !== "function") return;
  try {
    ui.restoreTranscript(loadPiSessionTranscriptTurns(session.path));
  } catch (err) {
    ui.writeln(`Warning: failed to restore session transcript: ${err.message}`);
  }
}

function writeLines(ui, lines) {
  for (const line of lines) ui.writeln(line);
  return { handled: true };
}

function isResumeSuccess(lines) {
  return Array.isArray(lines) && lines.some((line) => String(line).startsWith("Resumed pi session:"));
}
