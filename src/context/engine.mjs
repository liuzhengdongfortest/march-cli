import { resolve } from "node:path";
import { buildSessionIdentity } from "./session-status.mjs";
import { buildSystemCore, resolveSystemCorePromptKey } from "./system-core.mjs";
import { buildInjectionsLayer } from "./injections.mjs";
import { buildProjectContext } from "./project-context.mjs";
import { buildProfileLayers } from "./profiles.mjs";
import { formatRecallHints } from "../memory/markdown-store.mjs";
import { buildTurnRecord, getTurnAssistantContent, getTurnRecallHints, getTurnStartRecallHints, getTurnUserContent, normalizeTurnRecords } from "../session/turn-record.mjs";

export class ContextEngine {
  constructor({ cwd, modelId, provider = "deepseek", thinkingLevel = "medium", namespace = "", memoryRoot = null, remoteMemorySources = [], profilePaths = null, shellRuntime = null, lspService = null, injections = [], maxTurns, trimBatch }) {
    this.cwd = cwd;
    this.memoryRoot = memoryRoot;
    this.profilePaths = profilePaths;
    this.remoteMemorySources = remoteMemorySources;
    this.modelId = modelId;
    this.provider = provider;
    this.thinkingLevel = thinkingLevel;
    this.turns = [];
    this.sessionName = "";
    this.toolDefs = [];
    this.namespace = namespace;
    this.shellRuntime = shellRuntime;
    this.lspService = lspService;
    this.injections = [...injections];
    this.maxTurns = maxTurns ?? 15;
    this.trimBatch = trimBatch ?? 5;
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

    layers.push(...buildProfileLayers(this.profilePaths));

    layers.push({ name: "recent_chat", text: this.#buildRecentChat() });

    return layers;
  }

  recordTurn({ userMessage, assistantMessage, userExecutionJson = null, assistantExecutionJson = null }) {
    const turn = buildTurnRecord({
      index: this.turns.length + 1,
      userContent: userMessage,
      assistantContent: assistantMessage,
      userExecutionJson,
      assistantExecutionJson,
    });
    this.turns.push(turn);
    return turn;
  }

  getRecentRecallMemoryIds() {
    const ids = new Set();
    for (const turn of this.turns) {
      for (const hint of getTurnRecallHints(turn)) if (hint?.id) ids.add(hint.id);
    }
    return ids;
  }

  resolvePath(raw) {
    return resolve(this.cwd, raw);
  }

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

  restoreSession(data, _pool, { replace = false } = {}) {
    if (replace) {
      this.turns = [];
      this.sessionName = "";
    }
    if (data.turns) this.turns = normalizeTurnRecords(data.turns);
    if (typeof data.sessionName === "string") this.sessionName = data.sessionName;
    this.setRuntimeState(data);
  }

  // ── Private layers ──────────────────────────────────────────────────

  #buildSessionIdentity() {
    return buildSessionIdentity({ cwd: this.cwd, workspaceRoot: this.cwd, memoryRoot: this.memoryRoot, remoteMemorySources: this.remoteMemorySources });
  }

  #buildRecentChat() {
    if (this.turns.length === 0) {
      return `[recent_chat]\n(no prior turns)`;
    }
    const entries = [];
    const recentTurns = this.turns.slice(-this.maxTurns);
    for (const turn of recentTurns) {
      let block = `## Turn ${turn.index}\n` +
        `[user]\n${getTurnUserContent(turn)}\n`;
      const userRecall = formatRecallHints(getTurnStartRecallHints(turn));
      if (userRecall) block += `\n${userRecall}\n`;
      block += `\n[assistant]\n`;
      const assistantText = getTurnAssistantContent(turn);
      if (assistantText) {
        block += `\n${String(assistantText ?? "")}\n`;
      }
      entries.push(block);
    }
    return `[recent_chat]\n${entries.join("\n\n")}`;
  }

}



function appendCurrentUser(recentChat, userMessage) {
  const currentUser = String(userMessage ?? "").trimEnd();
  return `${recentChat}\n\n[current_user]\n${currentUser}`;
}
