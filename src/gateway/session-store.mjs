import { createModeState, MODES } from "../cli/input/mode-state.mjs";
import { gatewaySessionKey } from "./message.mjs";
import { resolveGatewayWorkspace } from "./config.mjs";

export class GatewaySessionStore {
  #gatewayConfig;
  #sessions = new Map();

  constructor({ gatewayConfig }) {
    this.#gatewayConfig = gatewayConfig;
  }

  getOrCreate(message) {
    const key = gatewaySessionKey(message);
    const existing = this.#sessions.get(key);
    if (existing) return existing;

    const workspaceAlias = this.#gatewayConfig?.defaultWorkspace ?? null;
    const workspace = resolveGatewayWorkspace(this.#gatewayConfig, workspaceAlias);
    const session = {
      key,
      platform: message.platform,
      chatId: message.chatId,
      threadId: message.threadId,
      // Remote social entrypoints default to safe discussion mode.
      modeState: createModeState({ initial: MODES.DISCUSS }),
      workspaceAlias,
      workspaceRoot: workspace?.root ?? null,
      marchSessionId: `gateway:${key}`,
    };
    this.#sessions.set(key, session);
    return session;
  }

  setWorkspace(session, alias) {
    const workspace = resolveGatewayWorkspace(this.#gatewayConfig, alias);
    if (!workspace) throw new Error(`Unknown gateway workspace: ${alias}`);
    session.workspaceAlias = workspace.alias;
    session.workspaceRoot = workspace.root;
    return session;
  }

  listWorkspaces() {
    return Object.values(this.#gatewayConfig?.workspaces ?? {});
  }
}
