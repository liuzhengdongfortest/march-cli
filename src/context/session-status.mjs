export function buildSessionIdentity({
  cwd,
  workspaceRoot = cwd,
  memoryRoot = null,
  remoteMemorySources = [],
  platform = process.platform,
} = {}) {
  const shellInfo = platform === "win32"
    ? "shells: powershell (recommended), bash (Git Bash)"
    : "shell: bash";
  const memoryInfo = memoryRoot ? `memory_root: ${memoryRoot}\n` : "";
  const remoteInfo = formatRemoteMemorySources(remoteMemorySources);

  return `[session_identity]
cwd: ${cwd}
workspace_root: ${workspaceRoot}
${memoryInfo}${remoteInfo}platform: ${platform}
${shellInfo}`;
}

function formatRemoteMemorySources(sources = []) {
  const items = Array.isArray(sources) ? sources : [];
  if (items.length === 0) return "";
  return `remote_memories:\n${items.map((source) => `- ${source.name}`).join("\n")}\n`;
}
