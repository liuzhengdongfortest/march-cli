import { homedir } from "node:os";
import { relative } from "node:path";

export function buildContext({ cwd, pins, skills }) {
  const layers = [];

  layers.push(buildSystemCore());
  layers.push(buildSessionStatus({ cwd }));
  if (skills.length > 0) layers.push(buildActiveSkills(skills));
  if (pins.length > 0) layers.push(buildRuntimeStatus({ pins }));
  layers.push(buildRecentChat());

  return layers.join("\n\n");
}

function buildSystemCore() {
  return `[system_core]
You are March, a terminal-native coding agent. You work in the user's project directory, reading and editing files directly. You have access to file tools (read, write, edit), a sandboxed shell, and search tools.

Be concise. Default to editing existing files. Don't add features beyond what's asked. Don't write comments unless the WHY is non-obvious.

When you finish a turn, call send_turn_summary to record what you did.`;
}

function buildSessionStatus({ cwd }) {
  const home = homedir();
  const relPath = cwd.startsWith(home) ? `~/${relative(home, cwd)}` : cwd;

  return `[session_status]
cwd: ${cwd}
platform: ${process.platform}
shell: ${process.env.SHELL ?? process.env.ComSpec ?? "unknown"}
project: ${relPath}`;
}

function buildActiveSkills(skills) {
  const lines = skills.map((s) => `- ${s}`);
  return `[active_skills]\n${lines.join("\n")}`;
}

function buildRuntimeStatus({ pins }) {
  const lines = pins.map((p) => `- pinned: ${p}`);
  return `[runtime_status]\n${lines.join("\n")}`;
}

function buildRecentChat() {
  return `[recent_chat]
No prior turns.`;
}
