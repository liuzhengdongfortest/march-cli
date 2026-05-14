export function escapeLikePath(path) {
  return String(path).replace(/[%_]/g, "\\$&");
}

export function graphUri(domain, path) {
  return `${domain}://${path}`;
}

export function leafName(path) {
  return String(path).split("/").pop();
}

export function pathExists(db, namespace, domain, path) {
  return Boolean(db.prepare(
    "SELECT 1 FROM paths WHERE namespace = ? AND domain = ? AND path = ?"
  ).get(namespace, domain, path));
}
