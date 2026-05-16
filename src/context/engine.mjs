import { resolve } from "node:path";
import { buildSessionIdentity, buildWorkspaceStatus } from "./session-status.mjs";
import { buildShellLayers } from "./shell-layers.mjs";
import { buildActiveSkills, buildSkillCatalog } from "./skill-layers.mjs";
import { buildSystemCore, resolveSystemCorePromptKey } from "./system-core.mjs";
import { buildInjectionsLayer } from "./injections.mjs";
import { buildProjectContext } from "./project-context.mjs";
import { buildDiagnosticsLayer } from "./diagnostics.mjs";
import { formatRecallHints } from "../memory/markdown-store.mjs";

export class ContextEngine {
  constructor({ cwd, modelId, provider = "deepseek", thinkingLevel = "medium", skills = [], skillPool = [], namespace = "", shellRuntime = null, lspService = null, injections = [], maxTurns, trimBatch }) {
    this.cwd = cwd;
    this.modelId = modelId;
    this.provider = provider;
    this.thinkingLevel = thinkingLevel;
    this.skills = [...skills];
    this.skillPool = skillPool;
    this.turns = [];
    this.sessionName = "";
    this.toolDefs = [];
    this.namespace = namespace;
    this.shellRuntime = shellRuntime;
    this.lspService = lspService;
    this.injections = [...injections];
    this.maxTurns = maxTurns ?? 15;
    this.trimBatch = trimBatch ?? 5;
    this._cachedWorkspaceStatus = null;
    this.systemCorePromptKey = resolveSystemCorePromptKey({ modelId });
    this.systemCore = buildSystemCore({ modelId });
  }

  // ── Public API ──────────────────────────────────────────────────────

  buildContext(userMessage = "") {
    return this.buildContextLayers(userMessage).map((layer) => layer.text).join("\n\n");
  }

  buildProviderContext(userMessage = "") {
    const layers = this.buildContextLayers(userMessage);
    const systemLayer = layers.find((layer) => layer.name === "system_core");
    return {
      system: systemLayer?.text ?? this.systemCore,
      userMessages: layers
        .filter((layer) => layer.name !== "system_core")
        .map((layer) => ({
          name: layer.name,
          content: layer.name === "recent_chat" ? appendCurrentUser(layer.text, userMessage) : layer.text,
        })),
    };
  }

  buildContextLayers(_userMessage = "") {
    const layers = [
      { name: "system_core", text: this.systemCore },
    ];

    const injectionsLayer = buildInjectionsLayer(this.injections);
    if (injectionsLayer) layers.push({ name: "injections", text: injectionsLayer });

    layers.push({ name: "session_identity", text: this.#buildSessionIdentity() });

    const projectCtx = buildProjectContext(this.cwd);
    if (projectCtx) layers.push({ name: "project_context", text: projectCtx });

    if (this.skillPool.length > 0) {
      layers.push({ name: "skill_catalog", text: this.#buildSkillCatalog() });
    }

    if (this.skills.length > 0) {
      layers.push({ name: "active_skills", text: this.#buildActiveSkills() });
    }

    layers.push(
      { name: "diagnostics", text: this.#buildDiagnostics() },
      { name: "workspace_status", text: this.#buildWorkspaceStatus() },
      ...this.#buildShellLayers().map((text, index) => ({ name: index === 0 ? "shells" : `shells_${index + 1}`, text })),
      { name: "recent_chat", text: this.#buildRecentChat() },
    );

    return layers;
  }

  recordTurn({ userMessage, assistantMessage, userRecallHints = [], assistantRecallHints = [] }) {
    this.turns.push({
      index: this.turns.length + 1,
      userMessage,
      assistantMessage: assistantMessage ?? "",
      userRecallHints,
      assistantRecallHints,
    });
    if (this.turns.length > this.maxTurns) {
      const keep = Math.max(1, this.maxTurns - this.trimBatch);
      this.turns = this.turns.slice(-keep);
    }
  }

  getRecentRecallMemoryIds() {
    const ids = new Set();
    for (const turn of this.turns) {
      for (const hint of turn.userRecallHints ?? []) if (hint?.id) ids.add(hint.id);
      for (const hint of turn.assistantRecallHints ?? []) if (hint?.id) ids.add(hint.id);
    }
    return ids;
  }

  resolvePath(raw) {
    return resolve(this.cwd, raw);
  }

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
      this.skills = [];
    }
    if (data.turns) this.turns = data.turns;
    if (typeof data.sessionName === "string") this.sessionName = data.sessionName;
    this.setRuntimeState(data);
    if (data.skills && pool) {
      const found = [];
      for (const name of data.skills) {
        const s = pool.find((sk) => sk.name === name);
        if (s) found.push(s);
      }
      if (found.length > 0) this.skills = found;
    }
  }

  // ── Private layers ──────────────────────────────────────────────────

  #buildSessionIdentity() {
    return buildSessionIdentity({ cwd: this.cwd, workspaceRoot: this.cwd });
  }

  #buildWorkspaceStatus() {
    if (!this._cachedWorkspaceStatus) {
      this._cachedWorkspaceStatus = buildWorkspaceStatus({ cwd: this.cwd });
    }
    return this._cachedWorkspaceStatus;
  }

  #buildDiagnostics() {
    return buildDiagnosticsLayer({
      snapshot: this.lspService?.snapshot?.() ?? { diagnostics: [] },
    });
  }

  #buildSkillCatalog() {
    return buildSkillCatalog(this.skillPool);
  }

  #buildActiveSkills() {
    return buildActiveSkills(this.skills);
  }

  #buildShellLayers() {
    return buildShellLayers({
      shellRuntime: this.shellRuntime,
      truncateText: (text, maxLen) => this.#truncate(text, maxLen),
    });
  }

  #buildRecentChat() {
    if (this.turns.length === 0) {
      return `[recent_chat]\n(no prior turns)`;
    }
    const entries = [];
    for (const turn of this.turns) {
      let block = `## Turn ${turn.index}\n` +
        `[user]\n${this.#truncate(turn.userMessage, 2000)}\n`;
      const userRecall = formatRecallHints("user", turn.userRecallHints ?? []);
      if (userRecall) block += `\n${userRecall}\n`;
      block += `\n[March]\n`;
      if (turn.assistantMessage) {
        block += `\n${this.#truncate(turn.assistantMessage, 2000)}\n`;
      }
      const assistantRecall = formatRecallHints("assistant", turn.assistantRecallHints ?? []);
      if (assistantRecall) block += `\n${assistantRecall}\n`;
      entries.push(block);
    }
    return `[recent_chat]\n${entries.join("\n\n")}`;
  }

  #truncate(text, maxLen) {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + "\n...(truncated)";
  }
}

function appendCurrentUser(recentChat, userMessage) {
  const currentUser = String(userMessage ?? "").trimEnd();
  return `${recentChat}\n\n[current_user]\n${currentUser}`;
}
