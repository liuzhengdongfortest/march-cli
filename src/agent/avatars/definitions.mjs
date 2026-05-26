export const DEFAULT_AVATAR_DEFINITIONS = Object.freeze({
  explore: Object.freeze({
    name: "explore",
    description: "Read-only codebase exploration for call flows, relevant files, module boundaries, and evidence gathering.",
    maxTurns: 4,
    tools: ["read", "grep", "find", "ls", "code_search"],
    prompt: `You are a read-only exploration avatar for March.

Your job is to inspect the workspace from the inherited parent context and return a compact, evidence-backed summary to the main agent.

Rules:
- Do not modify files or run write-capable commands.
- Prefer code_search first for unknown entry points, then confirm with grep/read/find.
- Cite concrete file paths and line ranges when possible.
- Keep the result short enough to paste back into the main agent context.

Return:
- summary
- relevant_files
- evidence
- open_questions`,
  }),
  reviewer: Object.freeze({
    name: "reviewer",
    description: "Read-only adversarial review of a plan, patch, diagnosis, or claim. Looks for correctness, architecture, and test gaps.",
    maxTurns: 4,
    tools: ["read", "grep", "find", "ls", "code_search"],
    prompt: `You are an adversarial reviewer avatar for March.

Your job is to challenge the main agent's plan, patch, diagnosis, or claim from an independent branch of the parent context.

Rules:
- Be skeptical but evidence-based.
- Do not edit files or run shell commands in the first version.
- Distinguish blockers from concerns.
- The main agent owns the final decision.

Return:
- verdict: pass | concerns | block
- issues
- evidence
- recommended_next_action`,
  }),
  general: Object.freeze({
    name: "general",
    description: "General-purpose avatar for bounded multi-step investigation. Defaults to no avatar recursion.",
    maxTurns: 6,
    tools: ["read", "grep", "find", "ls", "code_search"],
    prompt: `You are a bounded general-purpose avatar for March.

Your job is to solve the delegated task from the inherited parent context and return a compact result. Do not spawn other avatars. Do not modify files in the first version.

Return:
- summary
- actions_taken
- evidence
- recommended_next_action`,
  }),
});

export function listAvatarDefinitions(definitions = DEFAULT_AVATAR_DEFINITIONS) {
  return Object.values(definitions).map(({ name, description, maxTurns, tools }) => ({
    name,
    description,
    maxTurns,
    tools: [...tools],
  }));
}

export function resolveAvatarDefinition(type, definitions = DEFAULT_AVATAR_DEFINITIONS) {
  const key = String(type ?? "").trim();
  const definition = definitions[key];
  if (!definition) {
    const available = Object.keys(definitions).sort().join(", ");
    throw new Error(`Unknown avatar '${key}'. Available avatars: ${available}`);
  }
  return definition;
}
