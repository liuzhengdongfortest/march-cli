import { homedir } from "node:os";
import { isAbsolute, resolve, sep } from "node:path";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { ROOT_NODE_UUID } from "../memory/database.mjs";

export class ContextEngine {
  constructor({ cwd, modelId, provider = "deepseek", skills = [], pins = [], graph = null, glossary = null }) {
    this.cwd = cwd;
    this.modelId = modelId;
    this.provider = provider;
    this.skills = [...skills];
    this.pins = new Set(pins);
    this.turns = [];
    this.openFiles = new Map();
    this.graph = graph;
    this.glossary = glossary;
  }

  // ── Public API ──────────────────────────────────────────────────────

  buildContext(userMessage = "") {
    this.#refreshOpenFiles();
    const layers = [
      this.#buildSystemCore(),
      this.#buildInjections(),
      this.#buildSessionStatus(),
    ];

    if (this.graph) {
      layers.push(this.#buildMemory(userMessage));
    }

    if (this.skills.length > 0) {
      layers.push(this.#buildActiveSkills());
    }

    if (this.openFiles.size > 0) {
      layers.push(this.#buildOpenFiles());
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

  resolvePath(raw) {
    return isAbsolute(raw) ? raw : resolve(this.cwd, raw);
  }

  // ── openFiles management ────────────────────────────────────────────

  openFile(absPath) {
    const content = readFileSync(absPath, "utf8");
    const lineCount = content.split("\n").length;
    const pinned = this.pins.has(absPath);
    this.openFiles.set(absPath, { content, lineCount, pinned });
    return { content, lineCount, pinned };
  }

  closeFile(absPath) {
    const entry = this.openFiles.get(absPath);
    if (entry?.pinned) return false;
    return this.openFiles.delete(absPath);
  }

  isOpen(absPath) {
    return this.openFiles.has(absPath);
  }

  getOpenFile(absPath) {
    return this.openFiles.get(absPath);
  }

  // ── Pin management ─────────────────────────────────────────────────

  addPin(path) {
    this.pins.add(path);
    const entry = this.openFiles.get(path);
    if (entry) entry.pinned = true;
  }
  removePin(path) {
    this.pins.delete(path);
    const entry = this.openFiles.get(path);
    if (entry) entry.pinned = false;
  }
  hasPin(path) { return this.pins.has(path); }
  getPins() { return [...this.pins]; }

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

## File editing
- Use open_file to add files to your working set. Files in [open_files] are always current.
- Use edit_file(path, oldString, newString) to edit. oldString can be a line range ("55-64" or "55") — you do NOT need to reproduce the original text.
- edit_file only works on files in [open_files]. Use write_file for new files or full overwrites.

## Turn discipline
At the END of every turn, you MUST call send_turn_summary with a concise summary of what you accomplished. This is mandatory — your turn is not complete without it.`;
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

  // ── Layer 4: memory ────────────────────────────────────────────────
  #buildMemory(userMessage) {
    if (!this.graph) return "";
    const entries = [];
    const seen = new Set();

    // Boot: load project://boot children (first turn only)
    if (this.turns.length === 0) {
      try {
        const bootKids = this.graph.getChildren(ROOT_NODE_UUID);
        for (const kid of bootKids) {
          if (seen.has(kid.child_uuid) || !kid.content) continue;
          seen.add(kid.child_uuid);
          entries.push(`--- project://boot/${kid.name} (boot) ---\n${kid.content}`);
        }
      } catch {}
    }

    // Glossary keyword match → resolve node to path → get memory
    if (this.glossary && userMessage) {
      try {
        const matches = this.glossary.findInContent(userMessage);
        for (const m of matches) {
          if (seen.has(m.node_uuid)) continue;
          seen.add(m.node_uuid);
          // Query paths for this node to build a URI
          const pathRows = this.graph.db.prepare(
            "SELECT domain, path FROM paths WHERE node_uuid = ? LIMIT 1",
          ).all(m.node_uuid);
          const uri = pathRows.length > 0
            ? `${pathRows[0].domain}://${pathRows[0].path}`
            : `node:${m.node_uuid}`;
          // Get current memory content via DB
          const mem = this.graph.db.prepare(
            "SELECT content FROM memories WHERE node_uuid = ? AND deprecated = 0 ORDER BY id DESC LIMIT 1",
          ).get(m.node_uuid);
          if (mem?.content) {
            const truncated = mem.content.length > 800 ? mem.content.slice(0, 800) + "\n...(truncated)" : mem.content;
            entries.push(`--- ${uri} (match) ---\n${truncated}`);
          }
        }
      } catch {}
    }

    // session://current/* — all children of session root
    try {
      const sessionRoot = this.graph.getMemoryByPath("", "current", "session");
      if (sessionRoot) {
        const sessionKids = this.graph.getChildren(sessionRoot.node_uuid);
        for (const kid of sessionKids) {
          if (seen.has(kid.child_uuid) || !kid.content) continue;
          seen.add(kid.child_uuid);
          entries.push(`--- session://current/${kid.name} ---\n${kid.content}`);
        }
      }
    } catch {}

    if (entries.length === 0) return "";
    return `[memory]\n${entries.join("\n\n")}`;
  }

  // ── Layer 5: active_skills ─────────────────────────────────────────
  #buildActiveSkills() {
    const lines = this.skills.map((s) => `- ${s}`);
    return `[active_skills]\n${lines.join("\n")}`;
  }

  // ── Layer 5: open_files ────────────────────────────────────────────
  #buildOpenFiles() {
    const blocks = [];
    for (const [path, entry] of this.openFiles) {
      const marker = entry.pinned ? " (pinned)" : "";
      blocks.push(
        `--- ${path} (1-${entry.lineCount})${marker} ---\n${entry.content}`,
      );
    }
    return `[open_files]\n${blocks.join("\n\n")}`;
  }

  // ── Layer 6: runtime_status ────────────────────────────────────────
  #buildRuntimeStatus() {
    const now = new Date().toISOString();
    const turnCount = this.turns.length;
    const pressure = turnCount > 15 ? "high" : turnCount > 8 ? "moderate" : "low";
    const parts = [
      `time: ${now}`,
      `turn: ${turnCount + 1}`,
      `context_pressure: ${pressure}`,
    ];
    parts.push(`open_files: ${this.openFiles.size}`);
    if (this.pins.size > 0) {
      parts.push(`pinned_files:`);
      for (const p of this.pins) {
        parts.push(`  - ${p}`);
      }
    }
    return `[runtime_status]\n${parts.join("\n")}`;
  }

  // ── Layer 7: recent_chat ───────────────────────────────────────────
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

  // ── Internal ────────────────────────────────────────────────────────

  #refreshOpenFiles() {
    for (const [path, entry] of this.openFiles) {
      try {
        const content = readFileSync(path, "utf8");
        entry.content = content;
        entry.lineCount = content.split("\n").length;
      } catch {
        // File may have been deleted — keep stale content but mark
        entry.stale = true;
      }
    }
  }

  #truncate(text, maxLen) {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + "\n...(truncated)";
  }
}
