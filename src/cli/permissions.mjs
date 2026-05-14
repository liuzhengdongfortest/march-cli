// ── Permission categories ──────────────────────────────────────────────
export const PERM = Object.freeze({
  READ_ONLY: "read_only",
  FILE_WRITE: "file_write",
  COMMAND_EXEC: "command_exec",
  NETWORK_EXTERNAL: "network_external",
});

const CATEGORY_LABEL = {
  [PERM.READ_ONLY]: "read-only",
  [PERM.FILE_WRITE]: "file write",
  [PERM.COMMAND_EXEC]: "command exec",
  [PERM.NETWORK_EXTERNAL]: "network",
};

export function permissionLabel(cat) {
  return CATEGORY_LABEL[cat] ?? cat;
}

// ── Permitted modes ────────────────────────────────────────────────────
export const MODE = Object.freeze({
  DEFAULT: "default",
  DONT_ASK: "dontAsk",
  BYPASS: "bypassPermissions",
  ACCEPT_EDITS: "acceptEdits",
});

// ── Default tool → category mapping ────────────────────────────────────
const DEFAULT_CATEGORIES = {
  open_file: PERM.READ_ONLY,
  close_file: PERM.FILE_WRITE,
  edit_file: PERM.FILE_WRITE,
  command_exec: PERM.COMMAND_EXEC,
  terminal_spawn: PERM.COMMAND_EXEC,
  terminal_send: PERM.COMMAND_EXEC,
  terminal_run: PERM.COMMAND_EXEC,
  terminal_list: PERM.COMMAND_EXEC,
  terminal_kill: PERM.COMMAND_EXEC,
  terminal_resize: PERM.COMMAND_EXEC,
  terminal_clear: PERM.COMMAND_EXEC,
  terminal_search: PERM.COMMAND_EXEC,
  terminal_snapshot: PERM.COMMAND_EXEC,
  web_search: PERM.NETWORK_EXTERNAL,
  web_fetch: PERM.NETWORK_EXTERNAL,
};

export function createPermissionController({
  mode = MODE.DEFAULT,
  toolCategories = {},
  onRequestApproval = null,
} = {}) {
  const sessionApprovals = new Map();
  const categories = { ...DEFAULT_CATEGORIES, ...toolCategories };

  function getCategory(toolName) {
    if (categories[toolName] !== undefined) return categories[toolName];
    // MCP and unknown tools: default to most restrictive
    if (toolName.startsWith("mcp__")) return PERM.NETWORK_EXTERNAL;
    return PERM.COMMAND_EXEC;
  }

  function setCategory(toolName, category) {
    categories[toolName] = category;
  }

  function check(toolName) {
    const category = getCategory(toolName);

    if (category === PERM.READ_ONLY) return { behavior: "allow" };
    if (mode === MODE.BYPASS) return { behavior: "allow" };
    if (mode === MODE.DONT_ASK) {
      return { behavior: "deny", message: `Tool '${toolName}' requires ${permissionLabel(category)} permission, but permission mode is 'dontAsk'.` };
    }
    if (sessionApprovals.has(toolName)) return { behavior: "allow" };

    return { behavior: "ask", category, toolName };
  }

  function approve(toolName) {
    sessionApprovals.set(toolName, true);
  }

  function isApproved(toolName) {
    return sessionApprovals.has(toolName);
  }

  async function requestApproval(toolName, params, requestFn) {
    const decision = check(toolName);
    if (decision.behavior !== "ask") return decision;
    if (!requestFn) return decision;
    const ok = await requestFn({ toolName, params, category: decision.category });
    if (ok) {
      approve(toolName);
      return { behavior: "allow" };
    }
    return {
      behavior: "deny",
      message: `User denied ${toolName} (requires ${permissionLabel(decision.category)} permission).`,
    };
  }

  return { check, approve, isApproved, getCategory, setCategory, requestApproval, get mode() { return mode; } };
}
