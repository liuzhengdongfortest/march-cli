import { isAbsolute, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { buildRuntimeStatus } from "./runtime-status.mjs";
import { buildSessionIdentity, buildWorkspaceStatus } from "./session-status.mjs";
import { buildShellLayers } from "./shell-layers.mjs";
import { buildActiveSkills, buildSkillCatalog } from "./skill-layers.mjs";
import { buildOpenFilesLayer } from "./open-files-layer.mjs";
import { buildSystemCore, resolveSystemCorePromptKey } from "./system-core.mjs";
import { buildInjectionsLayer } from "./injections.mjs";
import { buildDiagnosticsLayer } from "./diagnostics.mjs";
import { formatRecallHints } from "../memory/markdown-store.mjs";

export class ContextEngine {
  constructor({ cwd, modelId, provider = "deepseek", thinkingLevel = "medium", skills = [], skillPool = [], pins = [], namespace = "", shellRuntime = null, lspService = null, injections = [] }) {
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
    this.namespace = namespace;
    this.shellRuntime = shellRuntime;
    this.lspService = lspService;
    this.injections = [...injections];
    this._compactionSummary = null;
    this.systemCorePromptKey = resolveSystemCorePromptKey({ modelId });
    this.systemCore = buildSystemCore({ modelId });
  }

  // ── Public API ──────────────────────────────────────────────────────

  buildContext(userMessage = "") {
    return this.buildContextLayers(userMessage).map((layer) => layer.text).join("\n\n");
  }

  buildContextLayers(_userMessage = "") {
    this.#refreshOpenFiles();
    const layers = [
      { name: "system_core", text: this.systemCore },
    ];

    const injectionsLayer = buildInjectionsLayer(this.injections);
    if (injectionsLayer) layers.push({ name: "injections", text: injectionsLayer });

    layers.push({ name: "session_identity", text: this.#buildSessionIdentity() });

    if (this.skillPool.length > 0) {
      layers.push({ name: "skill_catalog", text: this.#buildSkillCatalog() });
    }

    if (this.skills.length > 0) {
      layers.push({ name: "active_skills", text: this.#buildActiveSkills() });
    }

    if (this.openFiles.size > 0) {
      layers.push({ name: "open_files", text: this.#buildOpenFiles() });
    }

    layers.push(
      { name: "diagnostics", text: this.#buildDiagnostics() },
      { name: "workspace_status", text: this.#buildWorkspaceStatus() },
      { name: "runtime_status", text: this.#buildRuntimeStatus() },
      ...this.#buildShellLayers().map((text, index) => ({ name: index === 0 ? "shells" : `shells_${index + 1}`, text })),
      { name: "recent_chat", text: this.#buildRecentChat() },
    );

    return layers;
  }

  recordCompaction(summary) {
    this._compactionSummary = summary;
  }

  recordTurn({ userMessage, summary, assistantMessage, userRecallHints = [], assistantRecallHints = [] }) {
    this.turns.push({
      index: this.turns.length + 1,
      userMessage,
      summary,
      assistantMessage: assistantMessage ?? "",
      userRecallHints,
      assistantRecallHints,
    });
    if (this.turns.length > 10) {
      this.turns = this.turns.slice(-10);
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
  setInjections(injections = []) { this.injections = [...injections]; }
  setToolDefs(defs) { this.toolDefs = defs; }
  setRuntimeState({ modelId, provider, thinkingLevel } = {}) {
    if (modelId) this.modelId = modelId;
    if (provider) this.provider = provider;
    if (thinkingLevel) this.thinkingLevel = thinkingLevel;
    const nextPromptKey = resolveSystemCorePromptKey({ modelId: this.modelId });
    if (nextPromptKey !== this.systemCorePromptKey) {
      this.systemCorePromptKey = nextPromptKey;
      this.systemCore = buildSystemCore({ modelId: this.modelId });
    }
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

  // ── Layer 3: session_identity ──────────────────────────────────────
  #buildSessionIdentity() {
    return buildSessionIdentity({ cwd: this.cwd, workspaceRoot: this.cwd });
  }

  // ── Layer 7: workspace_status ──────────────────────────────────────
  #buildWorkspaceStatus() {
    return buildWorkspaceStatus({ cwd: this.cwd });
  }

  #buildDiagnostics() {
    return buildDiagnosticsLayer({
      snapshot: this.lspService?.snapshot?.() ?? { diagnostics: [] },
      openFiles: [...this.openFiles.keys()],
    });
  }

  // ── Layer 5: skills catalog (Tier 1: always in context) ────────────
  #buildSkillCatalog() {
    return buildSkillCatalog(this.skillPool);
  }

  // ── Layer 5: active_skills (Tier 2: full bodies when activated) ─────
  #buildActiveSkills() {
    return buildActiveSkills(this.skills);
  }

  // ── Layer 5: open_files ────────────────────────────────────────────
  #buildOpenFiles() {
    return buildOpenFilesLayer(this.openFiles);
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
  #buildShellLayers() {
    return buildShellLayers({
      shellRuntime: this.shellRuntime,
      truncateText: (text, maxLen) => this.#truncate(text, maxLen),
    });
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
        `[user]\n${this.#truncate(turn.userMessage, 2000)}\n`;
      const userRecall = formatRecallHints("user", turn.userRecallHints ?? []);
      if (userRecall) block += `\n${userRecall}\n`;
      block += `\n[March]\n` +
        `<WorkSummary>${turn.summary || "(no summary)"}</WorkSummary>\n`;
      if (turn.assistantMessage) {
        block += `\n${this.#truncate(turn.assistantMessage, 2000)}\n`;
      }
      const assistantRecall = formatRecallHints("assistant", turn.assistantRecallHints ?? []);
      if (assistantRecall) block += `\n${assistantRecall}\n`;
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
        entry.stale = false;
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
