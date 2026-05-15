export const MARCH_LIFECYCLE_LAYERS = Object.freeze([
  {
    name: "pi-agent-turn",
    owner: "pi runtime host",
    effects: Object.freeze(["read-runtime-diagnostics"]),
  },
  {
    name: "march-agent-runtime",
    owner: "March runner",
    effects: Object.freeze(["read-session-ref", "read-sidecar-metadata", "read-runtime-state"]),
  },
  {
    name: "march-collaboration",
    owner: "March orchestrator",
    effects: Object.freeze(["read-group-ref", "read-workspace-ref", "read-diff-metadata"]),
  },
]);

export const DEFAULT_MARCH_HOOK_POLICY = Object.freeze({
  mode: "read-only",
  defaultBlocking: false,
  allowedEffects: Object.freeze([
    "read-group-ref",
    "read-agent-ref",
    "read-workspace-ref",
    "read-session-ref",
    "read-sidecar-metadata",
    "read-diff-metadata",
    "read-runtime-diagnostics",
    "write-diagnostics",
  ]),
  deniedEffects: Object.freeze([
    "write-files",
    "run-shell",
    "switch-session",
    "commit-worktree",
    "read-private-agent-context",
  ]),
});

export function createMarchLifecycleAdapter({
  cwd,
  projectMarchDir,
  extensionPaths = [],
  sessionBinding,
  engine,
  getSessionStats,
  getRuntimeDiagnostics = () => [],
  manifestHooks = [],
  manifestDiagnostics = [],
}) {
  const hooks = new Map();
  const adapterDiagnostics = [...manifestDiagnostics];

  for (const manifestHook of manifestHooks) {
    try {
      registerManifestHook(hooks, manifestHook);
    } catch (err) {
      adapterDiagnostics.push({
        type: "warning",
        message: `Failed to register March lifecycle hook ${manifestHook?.id ?? "(unknown)"}: ${err.message}`,
        path: manifestHook?.sourcePath,
      });
    }
  }

  return {
    registerHook(hook) {
      const normalized = normalizeHook(hook);
      const deniedEffect = normalized.effects
        .map((effect) => evaluateMarchHookEffect(effect))
        .find((result) => !result.allowed);
      if (deniedEffect) {
        throw new Error(deniedEffect.reason);
      }
      hooks.set(normalized.id, normalized);
      return normalized;
    },

    unregisterHook(id) {
      return hooks.delete(id);
    },

    async runHook(kind, payload = {}) {
      const matchingHooks = [...hooks.values()].filter((hook) => hook.kind === kind);
      const results = [];
      for (const hook of matchingHooks) {
        const result = await runRegisteredHook(hook, {
          facts: buildFacts({ cwd, projectMarchDir, engine, getSessionStats }),
          payload,
          canExecute: evaluateMarchHookEffect,
        }, adapterDiagnostics);
        results.push(result);
      }
      return results;
    },

    getState() {
      return {
        status: "read-only",
        registeredHookCount: hooks.size,
        extensionPathCount: extensionPaths.length,
        hookKinds: [...new Set([...hooks.values()].map((hook) => hook.kind))].sort(),
        facts: buildFacts({ cwd, projectMarchDir, engine, getSessionStats }),
        layers: MARCH_LIFECYCLE_LAYERS,
        policy: DEFAULT_MARCH_HOOK_POLICY,
        diagnostics: [
          {
            type: "info",
            message: hooks.size === 0
              ? "March lifecycle hook adapter is read-only; no March hooks are registered."
              : "March lifecycle hook adapter is read-only; registered hooks are permission-gated.",
          },
          ...adapterDiagnostics,
          ...getRuntimeDiagnostics(),
        ],
      };
    },

    canExecute(effect) {
      return evaluateMarchHookEffect(effect);
    },

    getActiveSession() {
      return sessionBinding?.get?.() ?? null;
    },
  };
}

function registerManifestHook(hooks, manifestHook) {
  const normalized = normalizeHook({
    ...manifestHook,
    handler: () => ({
      sourcePath: manifestHook.sourcePath,
      description: manifestHook.description,
    }),
  });
  const deniedEffect = normalized.effects
    .map((effect) => evaluateMarchHookEffect(effect))
    .find((result) => !result.allowed);
  if (deniedEffect) throw new Error(deniedEffect.reason);
  hooks.set(normalized.id, normalized);
  return normalized;
}

export function evaluateMarchHookEffect(effect) {
  if (DEFAULT_MARCH_HOOK_POLICY.allowedEffects.includes(effect)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: DEFAULT_MARCH_HOOK_POLICY.deniedEffects.includes(effect)
      ? `March lifecycle hooks cannot ${effect} in read-only mode`
      : `Unknown March lifecycle hook effect: ${effect}`,
  };
}

function buildFacts({ cwd, projectMarchDir, engine, getSessionStats }) {
  const stats = getSessionStats?.();
  return {
    cwd,
    projectMarchDir,
    sessionId: stats?.sessionId ?? null,
    sessionFile: stats?.sessionFile ?? null,
    persisted: Boolean(stats?.persisted),
    runtimeHost: Boolean(stats?.runtimeHost),
    modelId: engine?.modelId ?? null,
    provider: engine?.provider ?? null,
    thinkingLevel: engine?.thinkingLevel ?? null,
    namespace: engine?.namespace ?? null,
    turnCount: engine?.turns?.length ?? 0,
  };
}

function normalizeHook(hook) {
  if (!hook || typeof hook !== "object") throw new Error("March lifecycle hook must be an object");
  if (!hook.id || typeof hook.id !== "string") throw new Error("March lifecycle hook requires a string id");
  if (!hook.kind || typeof hook.kind !== "string") throw new Error("March lifecycle hook requires a string kind");
  if (typeof hook.handler !== "function") throw new Error("March lifecycle hook requires a handler function");
  return {
    id: hook.id,
    kind: hook.kind,
    effects: [...new Set(hook.effects ?? [])].sort(),
    blocking: Boolean(hook.blocking ?? DEFAULT_MARCH_HOOK_POLICY.defaultBlocking),
    handler: hook.handler,
  };
}

async function runRegisteredHook(hook, context, diagnostics) {
  try {
    for (const effect of hook.effects) {
      const gate = evaluateMarchHookEffect(effect);
      if (!gate.allowed) throw new Error(gate.reason);
    }
    const value = await hook.handler(Object.freeze({
      facts: Object.freeze({ ...context.facts }),
      payload: Object.freeze({ ...context.payload }),
      canExecute: context.canExecute,
    }));
    return { id: hook.id, kind: hook.kind, ok: true, value };
  } catch (err) {
    const diagnostic = {
      type: hook.blocking ? "error" : "warning",
      message: `March lifecycle hook ${hook.id} failed: ${err.message}`,
    };
    diagnostics.push(diagnostic);
    if (hook.blocking) throw err;
    return { id: hook.id, kind: hook.kind, ok: false, error: err.message };
  }
}
