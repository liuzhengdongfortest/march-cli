const RRF_K = 60;

export function rrfFuse(resultSets, { limit = 80 } = {}) {
  const fused = new Map();
  for (const { results, weight = 1 } of resultSets) {
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      const id = result.chunk.id;
      const current = fused.get(id) ?? { chunk: result.chunk, score: 0, sources: [] };
      current.score += weight / (RRF_K + index + 1);
      current.sources.push({ rank: index + 1, score: result.score });
      fused.set(id, current);
    }
  }
  return [...fused.values()]
    .sort((a, b) => b.score - a.score || a.chunk.file_path.localeCompare(b.chunk.file_path))
    .slice(0, limit);
}
