import { randomUUID } from "node:crypto";
import { DEFAULT_AVATAR_DEFINITIONS, listAvatarDefinitions, resolveAvatarDefinition } from "./definitions.mjs";
import { runAvatarSession } from "./session.mjs";
import { captureAvatarContextSnapshot } from "./snapshot.mjs";

const DEFAULT_MAX_CONCURRENT = 3;
const RESULT_EXCERPT_LIMIT = 16000;

export function createAvatarRuntime({
  cwd,
  stateRoot,
  provider,
  modelId,
  modelRegistry,
  settingsManager,
  authStorage,
  createAgentSession,
  getParentSessionId = () => null,
  getCurrentUserRequest = () => "",
  getParentEngine = () => null,
  getCurrentModel = () => null,
  namespace = "avatar",
  shellRuntime = null,
  lspService = null,
  webTools = [],
  hostedTools = {},
  modelContextDumper = null,
  onModelPayload = null,
  logger = null,
  definitions = DEFAULT_AVATAR_DEFINITIONS,
  maxConcurrent = DEFAULT_MAX_CONCURRENT,
}) {
  const jobs = new Map();
  const queue = [];
  const concurrencyLimit = normalizeConcurrency(maxConcurrent);
  let running = 0;

  async function start({ avatar, say = "", task, description = "", mode = "foreground" } = {}) {
    if (!["foreground", "background"].includes(mode)) throw new Error(`Invalid DispatchAvatar mode '${mode}'`);
    if (!String(task ?? "").trim()) throw new Error("DispatchAvatar task is required");
    const definition = resolveAvatarDefinition(avatar, definitions);
    const snapshot = captureAvatarContextSnapshot({
      engine: getParentEngine?.(),
      parentSessionId: getParentSessionId?.(),
      currentUserRequest: getCurrentUserRequest?.(),
    });
    const job = createJob({ definition, say, task, description, mode, contextSnapshot: snapshot });
    jobs.set(job.id, job);
    enqueue(job);
    if (mode === "foreground") await job.promise;
    return snapshotJob(job);
  }

  function enqueue(job) {
    queue.push(job);
    job.promise = new Promise((resolve) => {
      job._resolve = resolve;
    });
    pump();
  }

  function pump() {
    while (running < concurrencyLimit && queue.length > 0) {
      const job = queue.shift();
      if (!job || job.status === "cancelled") continue;
      runJob(job);
    }
  }

  async function runJob(job) {
    running += 1;
    job.status = "running";
    job.startedAt = new Date().toISOString();
    try {
      const currentModel = getCurrentModel?.();
      const result = await runAvatarSession({
        cwd,
        stateRoot,
        provider: currentModel?.provider ?? provider,
        modelId: currentModel?.id ?? modelId,
        modelRegistry,
        settingsManager,
        authStorage,
        createAgentSession,
        definition: job.definition,
        say: job.say,
        task: job.task,
        contextSnapshot: job.contextSnapshot,
        jobId: job.id,
        namespace,
        shellRuntime,
        lspService,
        webTools,
        hostedTools,
        modelContextDumper,
        onModelPayload,
        logger,
        signal: job.abortController.signal,
      });
      job.status = "completed";
      job.result = normalizeResult(result);
    } catch (err) {
      job.status = job.abortController.signal.aborted ? "cancelled" : "failed";
      job.error = err?.message ?? String(err);
    } finally {
      running -= 1;
      job.completedAt = new Date().toISOString();
      job._resolve?.(snapshotJob(job));
      pump();
    }
  }

  function status(jobId = null) {
    if (jobId) return snapshotJob(requireJob(jobId));
    return [...jobs.values()].map(snapshotJob);
  }

  async function result(jobId, { wait = false } = {}) {
    const job = requireJob(jobId);
    if (wait && ["queued", "running"].includes(job.status)) await job.promise;
    return snapshotJob(job);
  }

  function cancel(jobId) {
    const job = requireJob(jobId);
    if (["completed", "failed", "cancelled"].includes(job.status)) return snapshotJob(job);
    job.abortController.abort();
    if (job.status === "queued") settleCancelledJob(job);
    return snapshotJob(job);
  }

  function requireJob(jobId) {
    const job = jobs.get(String(jobId ?? ""));
    if (!job) throw new Error(`Unknown avatar job '${jobId}'`);
    return job;
  }

  return {
    start,
    status,
    result,
    cancel,
    listDefinitions: () => listAvatarDefinitions(definitions),
    dispose() {
      for (const job of jobs.values()) {
        if (job.status === "queued") settleCancelledJob(job);
        else if (job.status === "running") job.abortController.abort();
      }
    },
  };
}

function normalizeConcurrency(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MAX_CONCURRENT;
}

function settleCancelledJob(job) {
  job.status = "cancelled";
  job.completedAt = new Date().toISOString();
  job._resolve?.(snapshotJob(job));
}

function createJob({ definition, say, task, description, mode, contextSnapshot }) {
  const now = new Date().toISOString();
  return {
    id: `avatar_${randomUUID().slice(0, 8)}`,
    definition,
    avatar: definition.name,
    description: String(description ?? "").trim(),
    say: String(say ?? ""),
    task: String(task ?? ""),
    mode,
    status: "queued",
    createdAt: now,
    startedAt: null,
    completedAt: null,
    contextSnapshot,
    result: null,
    error: null,
    abortController: new AbortController(),
    promise: null,
    _resolve: null,
  };
}

function snapshotJob(job) {
  return {
    job_id: job.id,
    avatar: job.avatar,
    description: job.description,
    status: job.status,
    created_at: job.createdAt,
    started_at: job.startedAt,
    completed_at: job.completedAt,
    context_snapshot: summarizeContextSnapshot(job.contextSnapshot),
    result: job.result,
    error: job.error,
  };
}

function normalizeResult(result) {
  const summary = truncate(String(result?.draft ?? "").trim() || "(avatar completed without text output)");
  return {
    summary,
    tool_calls: result?.toolCalls ?? [],
    model: result?.model ? { id: result.model.id, provider: result.model.provider } : null,
    thinking_level: result?.thinkingLevel ?? null,
  };
}

function summarizeContextSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    created_at: snapshot.created_at,
    parent_session_id: snapshot.parent_session_id,
    current_user_request: snapshot.current_user_request,
    inherited_turns: snapshot.inherited_context?.turns?.length ?? 0,
  };
}

function truncate(text) {
  if (text.length <= RESULT_EXCERPT_LIMIT) return text;
  return `${text.slice(0, RESULT_EXCERPT_LIMIT)}\n\n[truncated ${text.length - RESULT_EXCERPT_LIMIT} chars from avatar result]`;
}
