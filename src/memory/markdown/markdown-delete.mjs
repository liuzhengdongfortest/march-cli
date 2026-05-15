import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { formatMemoryMarkdown, normalizeTags, parseMemoryMarkdown } from "./markdown-format.mjs";

export function softDeleteMemoryFile({ path, entry = null, now = () => new Date() } = {}) {
  if (!existsSync(path)) throw new Error(`memory not found: ${path}`);
  const parsed = parseMemoryMarkdown(readFileSync(path, "utf8"));
  const id = String(parsed.frontmatter.id ?? entry?.id ?? "");
  if (!id) throw new Error(`memory file is missing id: ${path}`);
  if (String(parsed.frontmatter.status ?? "active") === "deleted") {
    return { id, path, status: "deleted", alreadyDeleted: true };
  }
  writeFileSync(path, formatMemoryMarkdown({
    frontmatter: {
      ...parsed.frontmatter,
      id,
      tags: normalizeTags(parsed.frontmatter.tags ?? entry?.tags ?? []),
      status: "deleted",
      updated_at: now().toISOString(),
    },
    body: parsed.body,
  }), "utf8");
  return { id, path, status: "deleted", alreadyDeleted: false };
}
