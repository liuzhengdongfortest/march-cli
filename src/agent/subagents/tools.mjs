import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolText } from "../tool-result.mjs";

export function createSubagentTools({ runtime }) {
  return [
    createAgentTool(runtime),
    createAgentStatusTool(runtime),
    createAgentResultTool(runtime),
    createAgentCancelTool(runtime),
  ];
}

function createAgentTool(runtime) {
  return defineTool({
    name: "Agent",
    label: "Agent",
    description: buildAgentDescription(runtime),
    parameters: Type.Object({
      description: Type.String({ description: "Short 3-7 word task description for the delegated subagent job." }),
      subagent_type: Type.String({ description: "Which subagent to run. Use one of the listed subagent types." }),
      prompt: Type.String({ description: "Complete task prompt for the fresh child session. Include all necessary context; it does not inherit conversation history." }),
      mode: Type.Optional(Type.Union([Type.Literal("foreground"), Type.Literal("background")], { description: "foreground waits for completion; background returns a job id immediately. Default foreground." })),
    }),
    execute: async (_toolCallId, params) => {
      const result = await runtime.start({ ...params, mode: params.mode ?? "foreground" });
      return toolText(formatJob(result), result);
    },
  });
}

function createAgentStatusTool(runtime) {
  return defineTool({
    name: "AgentStatus",
    label: "Agent Status",
    description: "List subagent jobs, or inspect one job by id. Use after starting background Agent jobs.",
    parameters: Type.Object({
      job_id: Type.Optional(Type.String({ description: "Optional job id. If omitted, all current subagent jobs are listed." })),
    }),
    execute: async (_toolCallId, params) => {
      const result = runtime.status(params.job_id ?? null);
      return toolText(Array.isArray(result) ? formatJobList(result) : formatJob(result), result);
    },
  });
}

function createAgentResultTool(runtime) {
  return defineTool({
    name: "AgentResult",
    label: "Agent Result",
    description: "Fetch a subagent job result. For running jobs, set wait=true to wait for completion.",
    parameters: Type.Object({
      job_id: Type.String({ description: "Subagent job id returned by Agent." }),
      wait: Type.Optional(Type.Boolean({ description: "Wait until queued/running job completes before returning. Default false." })),
    }),
    execute: async (_toolCallId, params) => {
      const result = await runtime.result(params.job_id, { wait: Boolean(params.wait) });
      return toolText(formatJob(result), result);
    },
  });
}

function createAgentCancelTool(runtime) {
  return defineTool({
    name: "AgentCancel",
    label: "Agent Cancel",
    description: "Cancel a queued or running background subagent job.",
    parameters: Type.Object({
      job_id: Type.String({ description: "Subagent job id returned by Agent." }),
    }),
    execute: async (_toolCallId, params) => {
      const result = runtime.cancel(params.job_id);
      return toolText(formatJob(result), result);
    },
  });
}

function buildAgentDescription(runtime) {
  const list = runtime.listDefinitions()
    .map((agent) => `- ${agent.name}: ${agent.description} Tools: ${agent.tools.join(", ")}. Max turns: ${agent.maxTurns}.`)
    .join("\n");
  return `Delegate a task to a fresh child subagent session. Use this for context offload, independent exploration, or adversarial review. Subagents do not inherit the main conversation history and do not talk to each other. Available subagents:\n${list}`;
}

function formatJobList(jobs) {
  if (jobs.length === 0) return "No subagent jobs.";
  return jobs.map((job) => `${job.job_id} ${job.subagent_type} ${job.status}${job.description ? ` — ${job.description}` : ""}`).join("\n");
}

function formatJob(job) {
  const lines = [
    `job_id: ${job.job_id}`,
    `subagent_type: ${job.subagent_type}`,
    `status: ${job.status}`,
  ];
  if (job.description) lines.push(`description: ${job.description}`);
  if (job.error) lines.push(`error: ${job.error}`);
  if (job.result?.summary) lines.push("", job.result.summary);
  return lines.join("\n");
}
