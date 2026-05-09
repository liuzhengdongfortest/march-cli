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
  return [
    `session: ${stats.sessionId}`,
    `messages: ${stats.userMessages}u + ${stats.assistantMessages}a + ${stats.toolCalls}t = ${stats.totalMessages} total`,
    `tokens: ${stats.tokens.input} in / ${stats.tokens.output} out (${stats.tokens.cacheRead} cache read, ${stats.tokens.cacheWrite} cache write)`,
    `cost: $${stats.cost.toFixed(4)}`,
  ];
}

export function listSessionStats({ runner }) {
  return formatSessionStats(runner.getSessionStats());
}
