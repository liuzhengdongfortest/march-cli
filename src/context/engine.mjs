import { isAbsolute, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { buildMemoryLayer } from "./memory-layer.mjs";
import { buildRuntimeStatus } from "./runtime-status.mjs";
import { buildSessionStatus } from "./session-status.mjs";

export class ContextEngine {
  constructor({ cwd, modelId, provider = "deepseek", thinkingLevel = "medium", skills = [], skillPool = [], pins = [], graph = null, glossary = null, namespace = "", shellRuntime = null }) {
    this.cwd = cwd;
    this.modelId = modelId;
    this.provider = provider;
    this.thinkingLevel = thinkingLevel;
    this.skills = [...skills];
    this.skillPool = skillPool;
    this.pins = new Set(pins);
    this.turns = [];
    this.sessionName = "";
    this.openFiles = new Map();
    this.toolDefs = [];
    this.graph = graph;
    this.glossary = glossary;
    this.namespace = namespace;
    this.shellRuntime = shellRuntime;
    this._compactionSummary = null;
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
      layers.push(buildMemoryLayer({
        graph: this.graph,
        glossary: this.glossary,
        turns: this.turns,
        namespace: this.namespace,
        userMessage,
      }));
    }

    if (this.skillPool.length > 0) {
      layers.push(this.#buildSkillCatalog());
    }

    if (this.skills.length > 0) {
      layers.push(this.#buildActiveSkills());
    }

    if (this.openFiles.size > 0) {
      layers.push(this.#buildOpenFiles());
    }

    if (this.toolDefs.length > 0) {
      layers.push(this.#buildTools());
    }

    layers.push(
      this.#buildRuntimeStatus(),
      ...this.#buildShells(),
      this.#buildRecentChat(),
    );

    return layers.join("\n\n");
  }

  recordCompaction(summary) {
    this._compactionSummary = summary;
  }

  recordTurn({ userMessage, summary, assistantMessage }) {
    this.turns.push({
      index: this.turns.length + 1,
      userMessage,
      summary,
      assistantMessage: assistantMessage ?? "",
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

  setSkills(skills) { this.skills = skills; }
  setToolDefs(defs) { this.toolDefs = defs; }
  setRuntimeState({ modelId, provider, thinkingLevel } = {}) {
    if (modelId) this.modelId = modelId;
    if (provider) this.provider = provider;
    if (thinkingLevel) this.thinkingLevel = thinkingLevel;
  }
  setSessionName(name) { this.sessionName = String(name || "").trim(); }

  restoreSession(data, pool, { replace = false } = {}) {
    if (replace) {
      this.turns = [];
      this.sessionName = "";
      this.openFiles = new Map();
      this.pins = new Set();
      this.skills = [];
      this._compactionSummary = null;
    }
    if (data.turns) this.turns = data.turns;
    if (typeof data.sessionName === "string") this.sessionName = data.sessionName;
    if (data._compactionSummary) this._compactionSummary = data._compactionSummary;
    this.setRuntimeState(data);
    if (data.pins) {
      for (const p of data.pins) {
        this.pins.add(p);
      }
    }
    if (data.openFiles) {
      for (const f of data.openFiles) {
        try { this.openFile(f); } catch {}
      }
    }
    if (data.skills && pool) {
      const found = [];
      for (const name of data.skills) {
        const s = pool.find((sk) => sk.name === name);
        if (s) found.push(s);
      }
      if (found.length > 0) this.skills = found;
    }
  }

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
- Use read(path) for quick file inspection, and open_file(path) when a file should stay in [open_files].
- Use grep(pattern), find(pattern), and ls(path) to explore the project before editing.
- Use edit_file(path, oldString, newString) for working-set edits. oldString can be a line range ("55-64" or "55") — you do NOT need to reproduce the original text.
- edit_file only works on files in [open_files]. Use write(path, content) for new files or full overwrites.

## Turn discipline
After each turn, March automatically summarizes your work for context continuity. Focus on the task — March handles the bookkeeping.`;
  }

  // ── Layer 2: injections ────────────────────────────────────────────
  #buildInjections() {
    return `[injections]
provider: ${this.provider}
model: ${this.modelId}
thinking: ${this.thinkingLevel}`;
  }

  // ── Layer 3: session_status ────────────────────────────────────────
  #buildSessionStatus() {
    return buildSessionStatus({ cwd: this.cwd });
  }

  // ── Layer 5: skills catalog (Tier 1: always in context) ────────────
  #buildSkillCatalog() {
    const lines = [
      "The following skills provide specialized instructions for specific tasks.",
      "When a task matches a skill's description, use activate_skill to load its full instructions.",
      "",
      "<available_skills>",
    ];
    for (const skill of this.skillPool) {
      lines.push("  <skill>");
      lines.push(`    <name>${skill.name}</name>`);
      lines.push(`    <description>${skill.description || "(no description)"}</description>`);
      lines.push("  </skill>");
    }
    lines.push("</available_skills>");
    return `[available_skills]\n${lines.join("\n")}`;
  }

  // ── Layer 5: active_skills (Tier 2: full bodies when activated) ─────
  #buildActiveSkills() {
    const blocks = this.skills.map((s) => {
      const name = typeof s === "string" ? s : s.name;
      const body = typeof s === "string" ? null : (s.body || s.raw);
      const baseDir = typeof s === "string" ? null : s.baseDir;
      if (body) {
        let header = `<skill_content name="${name}">\n`;
        if (baseDir) {
          header += `Skill directory: ${baseDir}\nRelative paths in this skill are relative to the skill directory.\n`;
        }
        return header + `\n${body}\n</skill_content>`;
      }
      return `- ${name}`;
    });
    return `[active_skills]\n${blocks.join("\n\n")}`;
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

  // ── Layer 6: tools ──────────────────────────────────────────────────
  #buildTools() {
    const lines = this.toolDefs.map((t) => {
      const params = t.parameters
        ? Object.entries(t.parameters).map(([k, v]) => `  ${k}: ${v}`).join("\n")
        : "  (none)";
      return `${t.name}\n  ${t.description}\n${params}`;
    });
    return `[tools]\n${lines.join("\n\n")}`;
  }

  // ── Layer 7: runtime_status ────────────────────────────────────────
  #buildRuntimeStatus() {
    return buildRuntimeStatus({
      turns: this.turns,
      sessionName: this.sessionName,
      openFilesCount: this.openFiles.size,
      pins: this.getPins(),
    });
  }

  // ── Layer 8: shells ────────────────────────────────────────────────
  #buildShells() {
    const shells = this.shellRuntime?.listShells?.() ?? [];
    if (!shells.length) return [];
    const blocks = shells.map((shell) => {
      const snapshot = this.shellRuntime.snapshotShell(shell.id);
      const output = snapshot.plain ? this.#truncate(snapshot.plain, 2000) : "(no output)";
      return [
        `## ${shell.name} (${shell.id})`,
        `status: ${shell.status}`,
        `command: ${shell.command}${shell.args?.length ? ` ${shell.args.join(" ")}` : ""}`,
        `cwd: ${shell.cwd}`,
        `lines: ${shell.lineCount}`,
        "recent_output:",
        output,
      ].join("\n");
    });
    return [`[shells]\n${blocks.join("\n\n")}`];
  }

  // ── Layer 9: recent_chat ───────────────────────────────────────────
  #buildRecentChat() {
    const entries = [];
    if (this._compactionSummary) {
      entries.push(`<CompactedHistory>\n${this._compactionSummary}\n</CompactedHistory>`);
    }
    if (this.turns.length === 0) {
      if (entries.length === 0) {
        return `[recent_chat]\n(no prior turns)`;
      }
      return `[recent_chat]\n${entries.join("\n\n")}`;
    }
    for (const turn of this.turns) {
      let block = `## Turn ${turn.index}\n` +
        `[user]\n${this.#truncate(turn.userMessage, 2000)}\n\n` +
        `[March]\n` +
        `<WorkSummary>${turn.summary || "(no summary)"}</WorkSummary>\n`;
      if (turn.assistantMessage) {
        block += `\n${this.#truncate(turn.assistantMessage, 2000)}\n`;
      }
      entries.push(block);
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
