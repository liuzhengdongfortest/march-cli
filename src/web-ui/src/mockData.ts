import type { WebUiModel } from "./model";

export const mockWebUiModel: WebUiModel = {
  activeSessionId: "web-shell",
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
      { id: "u1", type: "user_message", text: "参考 MindFS，做正式 Web UI。", time: "09:41" },
      { id: "m1", type: "assistant_message", text: "先组件化，runtime 保持不变。", time: "09:41" },
      {
        id: "th1",
        type: "assistant_thought",
        title: "Planning",
        text: "把 runtime 事件先整理成 timeline item，再交给 UI 渲染。",
        status: "closed",
      },
      { id: "t1", type: "tool_call", tool: "read", target: "workspace", status: "running" },
      { id: "tr1", type: "tool_result", tool: "read", summary: "4 files inspected", status: "done" },
      {
        id: "d1",
        type: "file_diff",
        path: "src/web-ui/src/model.ts",
        lines: [
          { kind: "add", text: "+ Timeline adapter model" },
          { kind: "keep", text: "  runtime adapter pending" },
        ],
      },
      {
        id: "term1",
        type: "terminal_output",
        command: "npm run test:fast",
        output: "PASS web-ui.smoke.mjs",
        status: "done",
      },
      {
        id: "perm1",
        type: "permission_request",
        title: "Write files",
        detail: "Edit local workspace source files",
        status: "approved",
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
