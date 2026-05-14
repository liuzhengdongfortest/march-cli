import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function parseMemoryMarkdown(content) {
  if (!content.startsWith("---\n")) return { frontmatter: {}, body: content, title: extractTitle(content) };
  const end = content.indexOf("\n---", 4);
  if (end === -1) throw new Error("unterminated frontmatter");
  const frontmatter = parseFrontmatter(content.slice(4, end));
  const body = content.slice(content.indexOf("\n", end + 1) + 1);
  return { frontmatter, body, title: extractTitle(body) };
}

export function formatMemoryMarkdown({ frontmatter, body }) {
  const lines = ["---"];
  for (const key of ["id", "name", "description", "status", "created_at", "updated_at"]) {
    if (frontmatter[key] != null) lines.push(`${key}: ${formatYamlScalar(frontmatter[key])}`);
  }
  lines.push("tags:");
  for (const tag of frontmatter.tags ?? []) lines.push(`  - ${formatYamlScalar(tag)}`);
  lines.push("---", "", String(body ?? "").trimEnd(), "");
  return lines.join("\n");
}

export function normalizeTags(tags) {
  const raw = Array.isArray(tags) ? tags : [tags];
  const out = [];
  for (const tag of raw) {
    const value = normalizeTag(tag);
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

export function expandTags(tags) {
  const terms = [];
  for (const tag of tags) {
    terms.push(tag);
    for (const part of tag.split(/[\/_-]+/)) {
      if (part) terms.push(part);
    }
  }
  return [...new Set(terms.map(normalizeText).filter(Boolean))];
}

export function quoteFtsTerm(term) {
  return `"${String(term).replace(/"/g, '""')}"`;
}

export function normalizeText(text) {
  return String(text ?? "").trim().toLowerCase();
}

export function generateMemoryId() {
  return `mem_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function slugify(value) {
  return String(value ?? "memory")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "memory";
}

export function walkMarkdownFiles(root) {
  const out = [];
  if (!existsSync(root)) return out;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) out.push(path);
    }
  };
  walk(root);
  return out;
}

function normalizeTag(tag) {
  return String(tag ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/\/{2,}/g, "/")
    .toLowerCase();
}

function parseFrontmatter(text) {
  const result = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2];
    if (value === "") {
      const items = [];
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
        i += 1;
        items.push(unquoteYaml(lines[i].replace(/^\s+-\s+/, "")));
      }
      result[key] = items;
    } else {
      result[key] = unquoteYaml(value);
    }
  }
  return result;
}

function unquoteYaml(value) {
  const trimmed = String(value ?? "").trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function formatYamlScalar(value) {
  const text = String(value ?? "");
  if (/[:#\n]|^\s|\s$/.test(text)) return JSON.stringify(text);
  return text;
}

function extractTitle(body) {
  return body.split(/\r?\n/).find((line) => line.startsWith("# "))?.slice(2).trim() ?? "";
}
