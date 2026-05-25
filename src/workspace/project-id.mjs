import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadOrCreateProjectId(projectMarchDir) {
  if (!existsSync(projectMarchDir)) mkdirSync(projectMarchDir, { recursive: true });
  const idFile = resolve(projectMarchDir, "project-id");
  if (existsSync(idFile)) {
    return readFileSync(idFile, "utf8").trim();
  }
  const id = randomUUID();
  writeFileSync(idFile, id, "utf8");
  return id;
}
