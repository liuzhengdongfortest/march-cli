import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../tool-result.mjs";

export function createAvatarTools({ runtime }) {
  return [
    createDispatchAvatarTool(runtime),
    createAvatarStatusTool(runtime),
    createAvatarResultTool(runtime),
    createAvatarCancelTool(runtime),
  ];
}

function createDispatchAvatarTool(runtime) {
  return defineTool({
    name: "DispatchAvatar",
    label: "Dispatch Avatar",
    description: buildDispatchAvatarDescription(runtime),
    parameters: Type.Object({
      description: Type.String({ description: "Short 3-7 word task description for the avatar job." }),
      avatar: Type.String({ description: "Which avatar to dispatch. Use one of the listed avatar types." }),
      say: Type.Optional(Type.String({ description: "What the main agent says to this avatar at dispatch time: current intent, stable conclusions, or emphasis." })),
      task: Type.String({ description: "The concrete task the avatar must complete and the result it should return." }),
      mode: Type.Optional(Type.Union([Type.Literal("foreground"), Type.Literal("background")], { description: "foreground waits for completion; background returns a job id immediately. Default foreground." })),
    }),
    execute: async (_toolCallId, params = {}) => {
      const result = await runtime.start({ ...params, mode: params.mode ?? "foreground" });
      return toolText(formatJob(result), result);
    },
  });
}

function createAvatarStatusTool(runtime) {
  return defineTool({
    name: "AvatarStatus",
    label: "Avatar Status",
    description: "List avatar jobs, or inspect one job by id. Use after starting background DispatchAvatar jobs.",
    parameters: Type.Object({
      job_id: Type.Optional(Type.String({ description: "Optional job id. If omitted, all current avatar jobs are listed." })),
    }),
    execute: async (_toolCallId, params = {}) => {
      const result = runtime.status(params.job_id ?? null);
      return toolText(Array.isArray(result) ? formatJobList(result) : formatJob(result), result);
    },
  });
}

function createAvatarResultTool(runtime) {
  return defineTool({
    name: "AvatarResult",
    label: "Avatar Result",
    description: "Fetch an avatar job result. For running jobs, set wait=true to wait for completion.",
    parameters: Type.Object({
      job_id: Type.String({ description: "Avatar job id returned by DispatchAvatar." }),
      wait: Type.Optional(Type.Boolean({ description: "Wait until queued/running job completes before returning. Default false." })),
    }),
    execute: async (_toolCallId, params = {}) => {
      const result = await runtime.result(params.job_id, { wait: Boolean(params.wait) });
      return toolText(formatJob(result), result);
    },
  });
}

function createAvatarCancelTool(runtime) {
  return defineTool({
    name: "AvatarCancel",
    label: "Avatar Cancel",
    description: "Cancel a queued or running background avatar job.",
    parameters: Type.Object({
      job_id: Type.String({ description: "Avatar job id returned by DispatchAvatar." }),
    }),
    execute: async (_toolCallId, params = {}) => {
      const result = runtime.cancel(params.job_id);
      return toolText(formatJob(result), result);
    },
  });
}

function buildDispatchAvatarDescription(runtime) {
  const list = runtime.listDefinitions()
    .map((avatar) => `- ${avatar.name}: ${avatar.description} Tools: ${avatar.tools.join(", ")}. Max model calls: ${avatar.maxModelCalls}.`)
    .join("\n");
  return `Dispatch a context-inheriting avatar session branched from the current March context. Use this for context offload, independent exploration, or adversarial review. Avatars inherit the parent context snapshot plus the dispatch message, but not the raw parent in-turn transcript. Available avatars:\n${list}`;
}

function formatJobList(jobs) {
  if (jobs.length === 0) return "No avatar jobs.";
  return jobs.map((job) => `${job.job_id} ${job.avatar} ${job.status}${job.description ? ` — ${job.description}` : ""}`).join("\n");
}

function formatJob(job) {
  const lines = [
    `job_id: ${job.job_id}`,
    `avatar: ${job.avatar}`,
    `status: ${job.status}`,
  ];
  if (job.description) lines.push(`description: ${job.description}`);
  if (job.context_snapshot?.inherited_turns != null) lines.push(`inherited_turns: ${job.context_snapshot.inherited_turns}`);
  if (job.error) lines.push(`error: ${job.error}`);
  if (job.result?.summary) lines.push("", job.result.summary);
  return lines.join("\n");
}
