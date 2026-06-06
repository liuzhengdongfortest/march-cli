# March Architecture Boundaries

March 的核心架构不是“CLI 里调用一堆工具”，而是：**CLI 只做交互外壳；Runner 子进程承载 Agent Runtime；pi-agent 执行模型循环；March 通过 Context、Tool、Session、Workspace 四个边界接入能力。**

## 1. Main runtime chain

```mermaid
flowchart LR
  User[User input / CLI command / TUI action]
  Shell[CLI Shell\ninteraction, rendering, commands]
  App[App Runtime\nconfig, auth, workspace wiring]
  Client[Runner Process Client\nIPC proxy, restart boundary]
  Runner[Agent Runtime Core\nAgent Run orchestration]
  Pi[pi-agent Session\nmodel loop, transcript, tool calls]
  Provider[Model Provider\nauth + transport]
  User --> Shell --> App --> Client --> Runner --> Pi --> Provider
  Provider --> Pi --> Runner --> Client --> Shell --> User
```

**Boundary rule:** CLI 只路由输入和渲染事件，不拥有 Agent 行为。Runtime 行为从 runner 子进程边界之后开始。

## 2. Agent Run lifecycle

```mermaid
sequenceDiagram
  participant CLI as CLI / Workspace Shell
  participant Runner as Agent Runtime Core
  participant Context as ContextEngine
  participant Pi as pi-agent Session
  participant Tools as Tool Capabilities
  participant Store as Session / History / Memory
  CLI->>Runner: runTurn(user request)
  Runner->>Context: build provider context
  Context-->>Runner: system prompt + user context layers
  Runner->>Pi: prompt(initial context + user request)
  loop Model Call loop owned by pi-agent
    Pi->>Pi: append assistant message
    Pi->>Tools: execute requested tool call
    Tools-->>Pi: tool result entry
    Pi->>Pi: prepare next provider payload
  end
  Pi-->>Runner: final assistant message
  Runner->>Store: record turn, history, session state
  Runner-->>CLI: render final output and status
```

**Boundary rule:** `runTurn` 协调一次 Agent Run，但不重写模型/工具循环；循环属于 pi-agent。

## 3. Context boundary

```mermaid
flowchart TB
  Start[Agent Run start] --> Engine[ContextEngine]
  Engine --> System[system_core\nmodel-specific March rules]
  Engine --> Inject[injections\nMCP / extension instructions]
  Engine --> Identity[session_identity\ncwd, workspace, platform]
  Engine --> Project[project_context\nAGENTS.md and project rules]
  Engine --> Profiles[profiles\nagent + user profile]
  Engine --> Recent[recent_chat\nrecent turns + recall hints]
  System --> Prompt[Initial pi prompt]
  Inject --> Prompt
  Identity --> Prompt
  Project --> Prompt
  Profiles --> Prompt
  Recent --> Prompt
  Prompt --> Transcript[pi transcript\nassistant, tools, results, steer messages]
  Transcript --> Payload[Provider payload hooks\nhosted tools, guards, transport tweaks]
```

**Boundary rule:** March context 在 Agent Run 起点组装；后续 Model Call 继续 pi-agent transcript。provider hook 只能调整 transport payload，不能重建 March context layers。

## 4. Runtime capability boundary

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
    Office[office]
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

**Boundary rule:** high-level runtime code 只装配能力。每个 capability 拥有自身行为；runner 不应该增长 capability-specific branches。

## 5. Workspace and process boundary

```mermaid
flowchart TB
  TUI[Active TUI] --> Router[Workspace Output Router]
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

**Boundary rule:** workspace supervision 选择 active project/session 并路由输出；单个 Agent Runtime 不关心全局 workspace 展示策略。

## 6. State boundary

```mermaid
flowchart LR
  Request[User request]
  subgraph MarchState[March-owned state]
    MSession[March session\nsession id, timeline, restore data]
    ContextTurns[Context turns\nrecent_chat source]
    History[History store\nsearchable past turns]
    Memory[Markdown memory\nlong-term knowledge]
  end
  subgraph PiState[pi-agent-owned state]
    Transcript[Transcript\ndialog entries, tool calls, results]
    SessionFile[pi session file]
  end
  Request --> MSession
  Request --> Transcript
  Transcript --> SessionFile
  MSession --> ContextTurns --> History
  Memory --> ContextTurns
```

**Boundary rule:** March session、pi session、ContextEngine turns、history、memory 相关但不能混成一个状态对象；混用会导致 stale context 和难排查的恢复行为。

## 7. Provider boundary

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

**Boundary rule:** provider 负责 auth、model discovery、quota/product transport 和 request execution；它不决定 March context 结构，`modelId` 只影响 model-specific system prompt。

## Architectural invariants

1. **Shell is not Agent Runtime.** CLI/TUI handles interaction, commands, and rendering; Agent behavior lives behind the runner boundary.
2. **Runtime wires, capabilities execute.** Core passes capability contracts into pi-agent; capability modules own behavior.
3. **Context is reconstructed, transcript is continued.** ContextEngine builds initial March context; pi-agent transcript carries in-run continuity.
4. **Provider is transport, not policy.** Provider code handles model connection concerns, not March context policy.
5. **Workspace is supervision, not execution.** Workspace code selects and routes project runtimes; individual runtimes execute Agent Runs.
6. **State stays layered.** March state, pi state, history, and memory remain separate so resume, recall, and rendering stay predictable.
