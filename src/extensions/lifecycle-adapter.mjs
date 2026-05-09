import { createHash } from "node:crypto";

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
    "read-summary-hash",
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
}) {
  return {
    getState() {
      const stats = getSessionStats?.();
      const summary = engine?._compactionSummary ?? "";
      return {
        status: "read-only",
        registeredHookCount: 0,
        extensionPathCount: extensionPaths.length,
        facts: {
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
          summaryHash: summary ? hashSummary(summary) : null,
        },
        layers: MARCH_LIFECYCLE_LAYERS,
        policy: DEFAULT_MARCH_HOOK_POLICY,
        diagnostics: [
          {
            type: "info",
            message: "March lifecycle hook adapter is read-only; no March hooks are registered.",
          },
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

function hashSummary(summary) {
  return createHash("sha256").update(summary).digest("hex").slice(0, 12);
}
