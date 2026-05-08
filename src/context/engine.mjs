import { homedir } from "node:os";
import { relative, sep } from "node:path";
import { readdirSync, statSync } from "node:fs";

export class ContextEngine {
  constructor({ cwd, modelId, provider = "deepseek", skills = [], pins = [] }) {
    this.cwd = cwd;
    this.modelId = modelId;
    this.provider = provider;
    this.skills = [...skills];
    this.pins = [...pins];
    this.turns = [];
  }

  buildContext() {
    const layers = [
      this.#buildSystemCore(),
      this.#buildInjections(),
      this.#buildSessionStatus(),
    ];

    if (this.skills.length > 0) {
      layers.push(this.#buildActiveSkills());
    }

    layers.push(
      this.#buildRuntimeStatus(),
      this.#buildRecentChat(),
    );

    return layers.join("\n\n");
  }

  recordTurn({ userMessage, summary }) {
    this.turns.push({
      index: this.turns.length + 1,
      userMessage,
      summary,
    });
    if (this.turns.length > 20) {
      this.turns = this.turns.slice(-20);
    }
  }

  setPins(pins) { this.pins = [...pins]; }
  setSkills(skills) { this.skills = [...skills]; }

  // ── Layer 1: system_core ───────────────────────────────────────────
  #buildSystemCore() {
    return `[system_core]
You are March, a terminal-native coding agent. You operate in the user's project directory with direct file access.

## Rules
- Be concise. Default to editing existing files over creating new ones.
- Don't add features, refactors, or abstractions beyond what's asked.
- Three similar lines beats a premature abstraction. No half-finished implementations.
- Don't add error handling, fallbacks, or validation for scenarios that can't happen.
- Default to writing no comments. Only add one when the WHY is non-obvious.
- Avoid backwards-compatibility hacks.

## Turn discipline
At the END of every turn, you MUST call send_turn_summary with a concise summary of what you accomplished. This is mandatory — your turn is not complete without it. The summary is embedded in recent_chat for your next turn's context.`;
  }

  // ── Layer 2: injections ────────────────────────────────────────────
  #buildInjections() {
    return `[injections]
provider: ${this.provider}
model: ${this.modelId}
thinking: off`;
  }

  // ── Layer 3: session_status ────────────────────────────────────────
  #buildSessionStatus() {
    const home = homedir();
    const displayPath = this.cwd.startsWith(home)
      ? `~${this.cwd.slice(home.length)}`
      : this.cwd;
    const tree = this.#buildDirTree(3);

    return `[session_status]
cwd: ${this.cwd}
platform: ${process.platform}
shell: ${process.env.SHELL ?? process.env.ComSpec ?? "unknown"}
project: ${displayPath}

Directory tree (top 3 levels):
${tree}`;
  }

  #buildDirTree(maxDepth) {
    const lines = [];
    const walk = (dir, prefix, depth) => {
      if (depth > maxDepth) return;
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      const skip = new Set(["node_modules", ".git", "playgroundnocturne_memory"]);
      entries = entries.filter(
        (e) => !e.name.startsWith(".") || e.name === ".march",
      );
      entries = entries.filter((e) => !skip.has(e.name));
      entries = entries.slice(0, 60);
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const isLast = i === entries.length - 1;
        const connector = isLast ? "└── " : "├── ";
        const nextPrefix = prefix + (isLast ? "    " : "│   ");
        if (entry.isDirectory()) {
          lines.push(`${prefix}${connector}${entry.name}/`);
          walk(`${dir}${sep}${entry.name}`, nextPrefix, depth + 1);
        } else {
          lines.push(`${prefix}${connector}${entry.name}`);
        }
      }
    };
    walk(this.cwd, "", 1);
    return lines.join("\n") || "(empty)";
  }

  // ── Layer 4: active_skills ─────────────────────────────────────────
  #buildActiveSkills() {
    const lines = this.skills.map((s) => `- ${s}`);
    return `[active_skills]\n${lines.join("\n")}`;
  }

  // ── Layer 5: runtime_status ────────────────────────────────────────
  #buildRuntimeStatus() {
    const now = new Date().toISOString();
    const turnCount = this.turns.length;
    const pressure = turnCount > 15 ? "high" : turnCount > 8 ? "moderate" : "low";
    const parts = [
      `time: ${now}`,
      `turn: ${turnCount + 1}`,
      `context_pressure: ${pressure}`,
    ];
    if (this.pins.length > 0) {
      parts.push(`pinned_files:`);
      for (const p of this.pins) {
        parts.push(`  - ${p}`);
      }
    }
    return `[runtime_status]\n${parts.join("\n")}`;
  }

  // ── Layer 6: recent_chat ───────────────────────────────────────────
  #buildRecentChat() {
    if (this.turns.length === 0) {
      return `[recent_chat]
(no prior turns)`;
    }
    const entries = [];
    for (const turn of this.turns) {
      entries.push(
        `## Turn ${turn.index}\n` +
        `[user]\n${this.#truncate(turn.userMessage, 2000)}\n\n` +
        `[summary]\n${this.#truncate(turn.summary, 500)}\n`,
      );
    }
    return `[recent_chat]\n${entries.join("\n\n")}`;
  }

  #truncate(text, maxLen) {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + "\n...(truncated)";
  }
}
