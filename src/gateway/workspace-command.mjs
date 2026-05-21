export function parseWorkspaceCommand(input) {
  const trimmed = String(input ?? "").trim();
  if (trimmed === "/workspace") return { type: "show" };
  if (trimmed === "/workspaces") return { type: "list" };
  const match = trimmed.match(/^\/workspace\s+set\s+(\S+)$/);
  if (match) return { type: "set", alias: match[1] };
  if (trimmed.startsWith("/workspace ")) return { type: "error", message: "Usage: /workspace, /workspaces, or /workspace set <alias>" };
  return { type: "none" };
}

export function handleWorkspaceCommand(command, { session, sessionStore }) {
  if (command.type === "error") return [`Error: ${command.message}`];
  if (command.type === "show") return [formatCurrentWorkspace(session)];
  if (command.type === "list") return formatWorkspaceList(sessionStore.listWorkspaces(), session.workspaceAlias);
  if (command.type === "set") {
    try {
      sessionStore.setWorkspace(session, command.alias);
      return [`Workspace: ${session.workspaceAlias} (${session.workspaceRoot})`];
    } catch (err) {
      return [`Error: ${err.message}`];
    }
  }
  return [];
}

function formatCurrentWorkspace(session) {
  if (!session.workspaceAlias || !session.workspaceRoot) return "Workspace: not configured";
  return `Workspace: ${session.workspaceAlias} (${session.workspaceRoot})`;
}

function formatWorkspaceList(workspaces, currentAlias) {
  if (workspaces.length === 0) return ["No gateway workspaces configured."];
  return [
    "Gateway workspaces:",
    ...workspaces.map((workspace) => {
      const marker = workspace.alias === currentAlias ? "*" : " ";
      return `${marker} ${workspace.alias}: ${workspace.root}`;
    }),
  ];
}
