export type FileNode = {
  id: string;
  name: string;
  kind: "file" | "folder";
  selected?: boolean;
  active?: boolean;
  bound?: boolean;
  gitStatus?: "added" | "deleted" | "ignored" | "modified" | "renamed" | "untracked";
  children?: FileNode[];
};

export type MarchTimelineEvent =
  | { id: string; type: "user_message"; text: string; time?: string }
  | { id: string; type: "assistant_message"; text: string; time?: string }
  | { id: string; type: "assistant_thought"; title: string; text: string; status: "open" | "closed" }
  | { id: string; type: "tool_call"; tool: string; target: string; status: "running" | "done" | "failed" }
  | { id: string; type: "tool_result"; tool: string; summary: string; status: "done" | "failed" }
  | { id: string; type: "file_diff"; path: string; lines: Array<{ kind: "add" | "remove" | "keep"; text: string }> }
  | { id: string; type: "terminal_output"; command: string; output: string; status: "running" | "done" | "failed" }
  | { id: string; type: "error"; message: string; detail?: string };

export type TimelineItem =
  | { id: string; kind: "message"; actor: "user" | "march"; text: string; time?: string }
  | { id: string; kind: "thought"; title: string; text: string; status: "open" | "closed" }
  | { id: string; kind: "tool"; tool: string; target: string; status: "running" | "done" | "failed"; summary?: string }
  | { id: string; kind: "diff"; path: string; lines: Array<{ kind: "add" | "remove" | "keep"; text: string }> }
  | { id: string; kind: "terminal"; command: string; output: string; status: "running" | "done" | "failed" }
  | { id: string; kind: "error"; message: string; detail?: string };

export type SessionSummary = {
  id: string;
  title: string;
  workspacePath?: string;
  time: string;
  active?: boolean;
};

export type ActivityEvent = {
  id: string;
  action: string;
  time: string;
};

export type ProviderQuotaSnapshot = {
  providerId: string;
  modelId?: string | null;
  label: string;
  planType?: string | null;
  capturedAt: string;
  limits: Array<{
    id: string;
    name: string;
    windows: Array<{
      id: string;
      label: string;
      usedPercent: number;
      remainingPercent: number;
      resetsAt?: string | null;
    }>;
  }>;
};

export type ComposerState = {
  mode: string;
  placeholder: string;
};

export type WebUiModel = {
  activeSessionId?: string | null;
  workspace: FileNode;
  timeline: {
    title: string;
    meta: string;
    events: MarchTimelineEvent[];
  };
  sessions: SessionSummary[];
  providerQuota?: ProviderQuotaSnapshot | null;
  activity: ActivityEvent[];
  composer: ComposerState;
};
