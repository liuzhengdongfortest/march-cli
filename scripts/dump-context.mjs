#!/usr/bin/env node
// Dump current March context snapshot to stdout and .march/context-snapshot.txt
// Usage: node march-cli/scripts/dump-context.mjs ["optional user message for glossary matching"]

import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { ContextEngine } from "../src/context/engine.mjs";
import { openDatabase } from "../src/memory/database.mjs";
import { GraphService } from "../src/memory/graph.mjs";
import { GlossaryService } from "../src/memory/glossary.mjs";
import { scanSkillDir } from "../src/skills/loader.mjs";
import { loadConfig } from "../src/config/loader.mjs";

const cwd = process.cwd();
const userMessage = process.argv[2] ?? "";
const outputPath = resolve(cwd, ".march", "context-snapshot.txt");

// ── Load real state (same as march startup) ──────────────────────────
const config = loadConfig(cwd);
const projectMarchDir = resolve(cwd, ".march");
if (!existsSync(projectMarchDir)) mkdirSync(projectMarchDir, { recursive: true });

// Memory
const memoryDb = openDatabase(resolve(projectMarchDir, "memory.db"));
const graph = new GraphService(memoryDb);
const glossary = new GlossaryService(memoryDb);

// Skills
const skillPool = scanSkillDir(resolve(cwd, ".march", "skills"));
const activeSkills = [...(config?.skills ?? [])];

// Build engine
const engine = new ContextEngine({
  cwd,
  modelId: config?.model ?? "deepseek-v4-pro",
  provider: "deepseek",
  skills: activeSkills,
  pins: config?.pins ?? [],
  graph,
  glossary,
});

// Tool definitions (the same set the agent sees)
engine.setToolDefs([
  { name: "open_file", description: "Add a file to your working set. File content injected into [open_files].", parameters: { path: "Absolute or relative path to the file" } },
  { name: "close_file", description: "Remove a file from your working set. Pinned files cannot be closed.", parameters: { path: "Absolute or relative path" } },
  { name: "edit_file", description: "Replace text in an open file. oldString can be a line range (\"55-64\") or exact text.", parameters: { path: "File path (must be in open_files)", oldString: "Line range or exact text to replace", newString: "Replacement text" } },
  { name: "write_file", description: "Create a new file or overwrite an existing one.", parameters: { path: "File path", content: "File content" } },
  { name: "send_turn_summary", description: "MANDATORY at the end of every turn. Record a concise summary.", parameters: { summary: "Concise summary (1-5 sentences)" } },
  { name: "bash", description: "Execute a shell command in the project directory. Sandboxed with timeout.", parameters: { command: "Shell command to execute", timeout: "Timeout in milliseconds (optional)" } },
  { name: "create_memory", description: "Create a new memory node in the graph.", parameters: { parent_path: "Parent path", title: "Node title", content: "Memory content", domain: "core/feature/temporal" } },
  { name: "read_memory", description: "Read a memory node or view. Accepts paths like project://boot, session://current, system://recent.", parameters: { path: "Memory path or system view" } },
  { name: "activate_skill", description: "Activate a skill from the pool.", parameters: { name: "Skill name" } },
  { name: "deactivate_skill", description: "Deactivate an active skill.", parameters: { name: "Skill name" } },
  { name: "list_skills", description: "List all available skills in the pool.", parameters: { "": "(none)" } },
  { name: "search_memory", description: "Full-text search across all memory content.", parameters: { query: "Search query" } },
  { name: "add_alias", description: "Add an alias (keyword) to a memory node for glossary matching.", parameters: { node_path: "Target node path", alias: "Alias text" } },
]);

const context = engine.buildContext(userMessage);

// ── Output ────────────────────────────────────────────────────────────
writeFileSync(outputPath, context, "utf8");

console.log(context);
console.error(`\n---`);
console.error(`Written to: ${outputPath}`);
console.error(`Layers: ${context.split("\n\n").length}`);
console.error(`Length:  ${context.length} chars`);
console.error(`User message for glossary match: ${userMessage ? `"${userMessage}"` : "(none)"}`);
