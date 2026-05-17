export function buildSessionIdentity({
  cwd,
  workspaceRoot = cwd,
  platform = process.platform,
} = {}) {
  const shellInfo = platform === "win32"
    ? "shells: powershell (recommended), bash (Git Bash)"
    : "shell: bash";

  return `[session_identity]
cwd: ${cwd}
workspace_root: ${workspaceRoot}
platform: ${platform}
${shellInfo}`;
}
