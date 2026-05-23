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

export type TimelineEvent =
  | { id: string; kind: "message"; actor: "user" | "march"; text: string }
  | { id: string; kind: "tool"; action: string; target: string; status: string }
  | { id: string; kind: "diff"; lines: Array<{ kind: "add" | "keep"; text: string }> };

export type SessionSummary = {
  id: string;
  title: string;
  time: string;
  active?: boolean;
};

export type ActivityEvent = {
  id: string;
  action: string;
  time: string;
};

export type ComposerState = {
  mode: string;
  placeholder: string;
};

export type WebUiModel = {
  workspace: FileNode;
  timeline: {
    title: string;
    meta: string;
    events: TimelineEvent[];
  };
  sessions: SessionSummary[];
  activity: ActivityEvent[];
  composer: ComposerState;
};
