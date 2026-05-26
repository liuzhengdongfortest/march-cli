import { randomUUID } from "node:crypto";
import { DEFAULT_SUBAGENT_DEFINITIONS, listSubagentDefinitions, resolveSubagentDefinition } from "./definitions.mjs";
import { runHeadlessSubagentSession } from "./headless-session.mjs";

const DEFAULT_MAX_CONCURRENT = 3;
const RESULT_EXCERPT_LIMIT = 16000;

export function createSubagentRuntime({
  cwd,
  stateRoot,
  provider,
  modelId,
  modelRegistry,
  settingsManager,
  authStorage,
  createAgentSession,
  getParentSessionId = () => null,
  getCurrentModel = () => null,
  namespace = "subagent",
  shellRuntime = null,
  lspService = null,
  webTools = [],
  hostedTools = {},
  logger = null,
  definitions = DEFAULT_SUBAGENT_DEFINITIONS,
  maxConcurrent = DEFAULT_MAX_CONCURRENT,
}) {
  const jobs = new Map();
  const queue = [];
  let running = 0;

  async function start({ subagent_type, prompt, description = "", mode = "foreground" } = {}) {
    const definition = resolveSubagentDefinition(subagent_type, definitions);
    const job = createJob({ definition, prompt, description, mode });
    jobs.set(job.id, job);
    enqueue(job);
    if (mode === "foreground") await job.promise;
    return snapshot(job);
  }

  function enqueue(job) {
    queue.push(job);
    job.promise = new Promise((resolve) => {
      job._resolve = resolve;
    });
    pump();
  }

  function pump() {
    while (running < maxConcurrent && queue.length > 0) {
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
      const result = await runHeadlessSubagentSession({
        cwd,
        stateRoot,
        provider: currentModel?.provider ?? provider,
        modelId: currentModel?.id ?? modelId,
        modelRegistry,
        settingsManager,
        authStorage,
        createAgentSession,
        definition: job.definition,
        prompt: job.prompt,
        parentSessionId: getParentSessionId?.(),
        namespace,
        shellRuntime,
        lspService,
        webTools,
        hostedTools,
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
      job._resolve?.(snapshot(job));
      pump();
    }
  }

  function status(jobId = null) {
    if (jobId) return snapshot(requireJob(jobId));
    return [...jobs.values()].map(snapshot);
  }

  async function result(jobId, { wait = false } = {}) {
    const job = requireJob(jobId);
    if (wait && ["queued", "running"].includes(job.status)) await job.promise;
    return snapshot(job);
  }

  function cancel(jobId) {
    const job = requireJob(jobId);
    if (["completed", "failed", "cancelled"].includes(job.status)) return snapshot(job);
    job.abortController.abort();
    if (job.status === "queued") {
      job.status = "cancelled";
      job.completedAt = new Date().toISOString();
      job._resolve?.(snapshot(job));
    }
    return snapshot(job);
  }

  function requireJob(jobId) {
    const job = jobs.get(String(jobId ?? ""));
    if (!job) throw new Error(`Unknown subagent job '${jobId}'`);
    return job;
  }

  return {
    start,
    status,
    result,
    cancel,
    listDefinitions: () => listSubagentDefinitions(definitions),
    dispose() {
      for (const job of jobs.values()) {
        if (["queued", "running"].includes(job.status)) job.abortController.abort();
      }
    },
  };
}

function createJob({ definition, prompt, description, mode }) {
  const now = new Date().toISOString();
  return {
    id: `subagent_${randomUUID().slice(0, 8)}`,
    definition,
    subagentType: definition.name,
    description: String(description ?? "").trim(),
    prompt: String(prompt ?? ""),
    mode,
    status: "queued",
    createdAt: now,
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
    abortController: new AbortController(),
    promise: null,
    _resolve: null,
  };
}

function snapshot(job) {
  return {
    job_id: job.id,
    subagent_type: job.subagentType,
    description: job.description,
    status: job.status,
    created_at: job.createdAt,
    started_at: job.startedAt,
    completed_at: job.completedAt,
    result: job.result,
    error: job.error,
  };
}

function normalizeResult(result) {
  const summary = truncate(String(result?.draft ?? "").trim() || "(subagent completed without text output)");
  return {
    summary,
    tool_calls: result?.toolCalls ?? [],
    model: result?.model ? { id: result.model.id, provider: result.model.provider } : null,
    thinking_level: result?.thinkingLevel ?? null,
  };
}

function truncate(text) {
  if (text.length <= RESULT_EXCERPT_LIMIT) return text;
  return `${text.slice(0, RESULT_EXCERPT_LIMIT)}\n\n[truncated ${text.length - RESULT_EXCERPT_LIMIT} chars from subagent result]`;
}
