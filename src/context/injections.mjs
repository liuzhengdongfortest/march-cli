export function buildInjectionsLayer(injections = []) {
  const blocks = injections
    .map(normalizeInjection)
    .filter(Boolean)
    .map(({ type, source, content }) => `## ${formatInjectionTitle(type, source)}\n${content}`);

  if (blocks.length === 0) return "";
  return `[injections]\n${blocks.join("\n\n")}`;
}

function normalizeInjection(injection) {
  if (!injection || typeof injection.content !== "string") return null;
  const content = injection.content.trim();
  if (!content) return null;
  return {
    type: String(injection.type || "external"),
    source: String(injection.source || "unknown"),
    content,
  };
}

function formatInjectionTitle(type, source) {
  if (type === "mcp_server") return `MCP server: ${source}`;
  if (type === "extension") return `Extension: ${source}`;
  return `${type}: ${source}`;
}
