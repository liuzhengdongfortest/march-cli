import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export function defaultProfilePaths() {
  const root = join(homedir(), ".march", "memory", "profiles");
  return {
    agent: join(root, "agent.md"),
    user: join(root, "user.md"),
  };
}

export function ensureProfileFiles(paths = defaultProfilePaths()) {
  for (const [kind, path] of Object.entries(paths)) {
    if (!path || existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, defaultProfileContent(kind), "utf8");
  }
}

export function buildProfileLayers(paths) {
  if (!paths) return [];
  return [
    buildProfileLayer("agent_profile", paths.agent),
    buildProfileLayer("user_profile", paths.user),
  ].filter(Boolean);
}

function buildProfileLayer(name, path) {
  if (!path || !existsSync(path)) return null;
  const content = readFileSync(path, "utf8").trimEnd();
  if (!content.trim()) return null;
  return { name, text: `[${name}]\n--- ${path} ---\n${content}` };
}

function defaultProfileContent(kind) {
  const title = kind === "agent" ? "Agent Profile" : "User Profile";
  return `# ${title}\n\n`;
}
