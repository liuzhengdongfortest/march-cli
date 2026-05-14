import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

const TEMPLATE_EXTENSIONS = new Set([".md", ".txt"]);
const TEMPLATE_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

export function loadPromptTemplates(cwd) {
  return loadPromptTemplatesFromDir(resolve(cwd, ".march", "templates"));
}

export function loadPromptTemplatesFromDir(dir) {
  if (!existsSync(dir)) return { templates: [], diagnostics: [] };

  const templates = [];
  const diagnostics = [];
  for (const entry of safeReadDir(dir, diagnostics)) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name);
    if (!TEMPLATE_EXTENSIONS.has(ext)) continue;
    const name = basename(entry.name, ext);
    const path = join(dir, entry.name);
    if (!TEMPLATE_NAME_RE.test(name)) {
      diagnostics.push({ type: "warning", message: `Skipped invalid template name: ${entry.name}`, path });
      continue;
    }
    try {
      templates.push({ name, path, body: readFileSync(path, "utf8") });
    } catch (err) {
      diagnostics.push({ type: "warning", message: `Failed to read template ${entry.name}: ${err.message}`, path });
    }
  }
  templates.sort((a, b) => a.name.localeCompare(b.name));
  return { templates, diagnostics };
}

export function expandPromptTemplate(input, templates = []) {
  const match = input.match(/^\/([A-Za-z][A-Za-z0-9_-]*)(?:\s+([\s\S]*))?$/);
  if (!match) return { type: "none" };
  const template = templates.find((item) => item.name === match[1]);
  if (!template) return { type: "none" };
  const rawArgs = (match[2] || "").trim();
  return {
    type: "template",
    name: template.name,
    prompt: renderPromptTemplate(template.body, rawArgs),
  };
}

export function renderPromptTemplate(body, rawArgs = "") {
  const args = splitTemplateArgs(rawArgs);
  return body.replace(/\{\{\s*(args|input|\d+)\s*\}\}/g, (_match, token) => {
    if (token === "args" || token === "input") return rawArgs;
    return args[Number(token) - 1] ?? "";
  }).trim();
}

export function formatPromptTemplateLines(templates = [], diagnostics = []) {
  const lines = ["Prompt templates:"];
  if (templates.length === 0) {
    lines.push("  (none)");
  } else {
    for (const template of templates) lines.push(`  /${template.name}`);
  }
  if (diagnostics.length > 0) {
    lines.push("Template diagnostics:");
    for (const diagnostic of diagnostics) {
      lines.push(`  - ${diagnostic.type ?? "warning"}: ${diagnostic.message}`);
    }
  }
  return lines;
}

function safeReadDir(dir, diagnostics) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    diagnostics.push({ type: "warning", message: `Failed to read templates directory: ${err.message}`, path: dir });
    return [];
  }
}

function splitTemplateArgs(rawArgs) {
  return rawArgs ? rawArgs.split(/\s+/).filter(Boolean) : [];
}
