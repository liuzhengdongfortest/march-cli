# March 架构边界

March 的核心架构不是“CLI 里调用一堆工具”，而是：**CLI 只做交互外壳；Runner 子进程承载 Agent Runtime；pi-agent 执行模型循环；March 通过 Context、Tool、Session、Workspace 四个边界接入能力。**

## 1. 主运行链路

```mermaid
flowchart LR
  User[用户输入 / CLI 参数 / TUI 操作]
  Shell[CLI Shell\n交互、渲染、命令]
  App[App Runtime\n配置、认证、workspace 组装]
  Client[Runner Process Client\nIPC 代理、重启边界]
  Runner[Agent Runtime Core\nAgent Run 编排]
  Pi[pi-agent Session\n模型循环、transcript、tool call]
  Provider[Model Provider\n鉴权与传输]
  User --> Shell --> App --> Client --> Runner --> Pi --> Provider
  Provider --> Pi --> Runner --> Client --> Shell --> User
```

**边界规则：** CLI 只路由输入和渲染事件，不拥有 Agent 行为。Runtime 行为从 runner 子进程边界之后开始。

## 2. Agent Run 生命周期

```mermaid
sequenceDiagram
  participant CLI as CLI / Workspace Shell
  participant Runner as Agent Runtime Core
  participant Context as ContextEngine
  participant Pi as pi-agent Session
  participant Tools as Tool Capabilities
  participant Store as Session / History / Memory
  CLI->>Runner: runTurn(用户请求)
  Runner->>Context: 组装 provider context
  Context-->>Runner: system prompt + user context layers
  Runner->>Pi: prompt(初始上下文 + 用户请求)
  loop pi-agent 拥有 Model Call 循环
    Pi->>Pi: 追加 assistant message
    Pi->>Tools: 执行模型请求的 tool call
    Tools-->>Pi: 返回 tool result entry
    Pi->>Pi: 准备下一次 provider payload
  end
  Pi-->>Runner: 最终 assistant message
  Runner->>Store: 记录 turn、history、session state
  Runner-->>CLI: 渲染最终输出和状态
```

**边界规则：** `runTurn` 协调一次 Agent Run，但不重写模型/工具循环；循环属于 pi-agent。

## 3. Context 边界

```mermaid
flowchart TB
  Start[Agent Run 开始] --> Engine[ContextEngine]
  Engine --> System[system_core\n模型专属 March 规则]
  Engine --> Inject[injections\nMCP / extension 指令]
  Engine --> Identity[session_identity\ncwd、workspace、platform]
  Engine --> Project[project_context\nAGENTS.md 和项目规则]
  Engine --> Profiles[profiles\nagent profile + user profile]
  Engine --> Recent[recent_chat\n近期 turn + recall hints]
  System --> Prompt[初始 pi prompt]
  Inject --> Prompt
  Identity --> Prompt
  Project --> Prompt
  Profiles --> Prompt
  Recent --> Prompt
  Prompt --> Transcript[pi transcript\nassistant、tools、results、steer messages]
  Transcript --> Payload[Provider payload hooks\nhosted tools、guards、transport tweaks]
```

**边界规则：** March context 在 Agent Run 起点组装；后续 Model Call 继续 pi-agent transcript。provider hook 只能调整 transport payload，不能重建 March context layers。

## 4. Runtime capability 边界

```mermaid
flowchart LR
  subgraph Core[Core]
    Cwd[cwd]
    Model[provider / model]
    Engine[ContextEngine]
    UI[UI event sink]
  end
  subgraph Capabilities[Capabilities]
    Files[read / grep / find / edit]
    Shell[shell / command]
    Memory[memory]
    Web[web / browser]
    Image[image]
    Avatar[avatar]
    MCP[MCP]
  end
  subgraph Infra[Infrastructure]
    Auth[auth / settings]
    Process[process / IPC]
    History[history / persistence]
    LSP[LSP / diagnostics]
    Lifecycle[lifecycle]
  end
  Core --> Boundary[Runner Session Boundary]
  Capabilities --> Boundary
  Infra --> Boundary
  Boundary --> Registry[Tool Capability Registry]
  Registry --> PiTools[pi-agent tool definitions]
```

**边界规则：** high-level runtime code 只装配能力。每个 capability 拥有自身行为；runner 不应该增长 capability-specific branches。

## 5. Workspace 与进程边界

```mermaid
flowchart TB
  TUI[当前 TUI] --> Router[Workspace Output Router]
  TUI --> Supervisor[Workspace Session Supervisor]
  subgraph ProjectA[Project runtime A]
    RunnerA[Runner process] --> SessionA[March session state] --> PiA[pi session]
  end
  subgraph ProjectB[Project runtime B]
    RunnerB[Runner process] --> SessionB[March session state] --> PiB[pi session]
  end
  Supervisor --> ProjectA
  Supervisor --> ProjectB
  Router --> ProjectA
  Router --> ProjectB
```

**边界规则：** workspace supervision 选择 active project/session 并路由输出；单个 Agent Runtime 不关心全局 workspace 展示策略。

## 6. State 边界

```mermaid
flowchart LR
  Request[用户请求]
  subgraph MarchState[March-owned state]
    MSession[March session\nsession id、timeline、restore data]
    ContextTurns[Context turns\nrecent_chat 来源]
    History[History store\n可搜索历史 turn]
    Memory[Markdown memory\n长期知识]
  end
  subgraph PiState[pi-agent-owned state]
    Transcript[Transcript\ndialog entries、tool calls、results]
    SessionFile[pi session file]
  end
  Request --> MSession
  Request --> Transcript
  Transcript --> SessionFile
  MSession --> ContextTurns --> History
  Memory --> ContextTurns
```

**边界规则：** March session、pi session、ContextEngine turns、history、memory 相关但不能混成一个状态对象；混用会导致 stale context 和难排查的恢复行为。

## 7. Provider 边界

```mermaid
flowchart TB
  Auth[Auth Storage] --> Registry[Model Registry]
  BuiltIn[Built-in providers] --> Registry
  Custom[Custom providers] --> Registry
  SuperGrok[SuperGrok provider] --> Registry
  Registry --> Selected[Selected model] --> PiProvider[pi provider transport]
  Selected -. modelId .-> SystemCore[Model-specific system_core prompt]
  SystemCore --> Context[ContextEngine]
```

**边界规则：** provider 负责 auth、model discovery、quota/product transport 和 request execution；它不决定 March context 结构，`modelId` 只影响 model-specific system prompt。

## 8. Daemon 与子进程边界

```mermaid
flowchart TB
  CLI[March CLI 主进程] --> Runner[Runner Runtime 子进程\nAgent Runtime 隔离边界]
  CLI --> Browser[Browser daemon\n浏览器扩展桥]
  CLI --> Gateway[Gateway daemon\n外部消息入口]
  CLI --> MemoryServe[Remote Memory server\n显式 memory API]
  Runner --> LSP[LSP server processes\n按需诊断子进程]
  Runner --> Pty[Shell / PTY\n用户显式工具进程]
  Runner -. deprecated .-> Office[Office archive\n不再注册 tools / daemon]
```

**边界规则：** browser、gateway、memory serve 是 daemon-like 服务；runner 是运行时隔离子进程；LSP、PTY、command_exec 是按需进程。Office 当前是弃用归档，不属于运行期 capability。

## 架构不变量

1. **Shell 不是 Agent Runtime。** CLI/TUI 处理交互、命令和渲染；Agent 行为在 runner 边界之后。
2. **Runtime 只装配，capability 负责执行。** Core 把 capability contract 接入 pi-agent；capability module 拥有具体行为。
3. **Context 重新组装，transcript 继续推进。** ContextEngine 构造初始 March context；pi-agent transcript 承载运行中的连续性。
4. **Provider 是传输边界，不是策略边界。** Provider 处理模型连接问题，不处理 March context policy。
5. **Workspace 是监督边界，不是执行边界。** Workspace 代码选择和路由 project runtime；单个 runtime 执行 Agent Run。
6. **Process 边界不能混用。** Daemon、runner 子进程和按需 spawned process 的生命周期不同，不能用同一套状态假设处理。
7. **State 必须分层。** March state、pi state、history、memory 保持分离，resume、recall 和渲染才可预测。