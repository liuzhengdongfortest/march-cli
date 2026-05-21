export function serializeError(err) {
  if (!err) return { message: "Unknown error" };
  if (typeof err === "string") return { message: err };
  const name = typeof err.name === "string" && err.name ? err.name : "Error";
  const stack = typeof err.stack === "string" ? err.stack : "";
  const message = readableErrorMessage(err);
  return { name, message, stack };
}

function readableErrorMessage(err) {
  if (typeof err?.message === "string" && err.message && err.message !== "[object Object]") return err.message;
  if (typeof err?.message === "object") return safeStringify(err.message);
  const json = safeStringify(err);
  return json === "{}" ? String(err) : json;
}

function safeStringify(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}
