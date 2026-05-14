export async function compactSession({ runner }) {
  try {
    const result = await runner.compact();
    if (result) return [`Compacted: ${result.summary?.length ?? 0} char summary`];
    return ["Compaction complete (nothing to compact)"];
  } catch (err) {
    return [`Error: ${err.message}`];
  }
}

export function formatSessionStats(stats) {
  const lines = [
    `session: ${stats.sessionId}`,
    `messages: ${stats.userMessages}u + ${stats.assistantMessages}a + ${stats.toolCalls}t = ${stats.totalMessages} total`,
    `tokens: ${stats.tokens.input} in / ${stats.tokens.output} out (${stats.tokens.cacheRead} cache read, ${stats.tokens.cacheWrite} cache write)`,
    `cost: $${stats.cost.toFixed(4)}`,
  ];
  if (typeof stats.persisted === "boolean") {
    const mode = stats.persisted ? "pi-jsonl" : "in-memory";
    const suffix = stats.sessionFile ? ` (${stats.sessionFile})` : "";
    lines.splice(1, 0, `persistence: ${mode}${suffix}`);
  }
  if (typeof stats.runtimeHost === "boolean") {
    const mode = stats.runtimeHost ? "pi-runtime-host" : "direct-agent-session";
    const command = stats.piSessionSwitching ? "available" : "requires pi runtime host";
    const insertAt = typeof stats.persisted === "boolean" ? 2 : 1;
    lines.splice(insertAt, 0, `runtime: ${mode}`, `/resume-pi: ${command}`);
  }
  return lines;
}

export function listSessionStats({ runner }) {
  return formatSessionStats(runner.getSessionStats());
}
