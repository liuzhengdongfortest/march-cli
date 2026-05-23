import type { WebUiModel } from "./model";

export const mockWebUiModel: WebUiModel = {
  workspace: {
    id: "root",
    name: "march-cli-standalone",
    kind: "folder",
    selected: true,
    bound: true,
    children: [
      {
        id: "src",
        name: "src",
        kind: "folder",
        children: [
          {
            id: "web-ui",
            name: "web-ui",
            kind: "folder",
            children: [
              { id: "app", name: "App.tsx", kind: "file", active: true, bound: true, gitStatus: "modified" },
              { id: "model", name: "model.ts", kind: "file" },
              { id: "styles", name: "styles.css", kind: "file" },
            ],
          },
        ],
      },
      { id: "test", name: "test", kind: "folder" },
      { id: "agents", name: "AGENTS.md", kind: "file" },
      { id: "package", name: "package.json", kind: "file", gitStatus: "modified" },
    ],
  },
  timeline: {
    title: "Web shell",
    meta: "mock adapter · fast",
    events: [
      { id: "u1", kind: "message", actor: "user", text: "参考 MindFS，做正式 Web UI。" },
      { id: "m1", kind: "message", actor: "march", text: "先组件化，runtime 保持不变。" },
      { id: "t1", kind: "tool", action: "read", target: "workspace", status: "done" },
      {
        id: "d1",
        kind: "diff",
        lines: [
          { kind: "add", text: "+ React UI model" },
          { kind: "keep", text: "  runtime adapter pending" },
        ],
      },
    ],
  },
  sessions: [
    { id: "web-shell", title: "Web shell", time: "now", active: true },
    { id: "memory", title: "Memory", time: "1d" },
  ],
  activity: [
    { id: "read", action: "read", time: "now" },
    { id: "edit", action: "edit", time: "2m" },
    { id: "test", action: "test", time: "5m" },
  ],
  composer: {
    mode: "Chat",
    placeholder: "Message March…",
  },
};
