/**
 * Shared session utility functions.
 */
export function formatSessionId(namespace, sessionName) {
  if (!namespace && !sessionName) return "default";
  if (!sessionName) return namespace;
  if (!namespace) return sessionName;
  return `${namespace}/${sessionName}`;
}

export function parseSessionId(sessionId) {
  if (!sessionId || sessionId === "default") return { namespace: "", sessionName: "default" };
  const idx = sessionId.indexOf("/");
  if (idx === -1) return { namespace: "", sessionName: sessionId };
  return { namespace: sessionId.slice(0, idx), sessionName: sessionId.slice(idx + 1) };
}
