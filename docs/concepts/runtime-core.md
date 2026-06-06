# Runtime Core Boundary

March Core 整理的第一条边界是：**Agent Runtime Core 只负责一次 Agent Run 如何开始、推进和结束；能力本身留在 Capability，运行支撑留在 Infrastructure。**

```text
CLI / Workspace Shell
  ↓
Agent Runtime Core
  ├── Agent Run lifecycle
  ├── Agent-run-start Context Assembly
  ├── Pi Transcript / Provider Payload wiring
  └── Tool execution boundary
        ↓
Capabilities
  ├── Coding tools
  ├── Memory
  ├── Web / Browser
  ├── Image
  ├── Avatar
  └── MCP

Infrastructure
  ├── Config / Auth
  ├── Runtime process / IPC
  ├── Persistence
  ├── Logging / Diagnostics
  └── Package / Release
```

## Core owns

| Area | Core responsibility |
|---|---|
| Agent Run lifecycle | Start from one user request, let pi-agent continue Model Calls and Tool Calls, finalize when the model stops calling tools. |
| Context Assembly | Build March context once at Agent Run start. In-run Model Calls use pi-agent's evolving transcript, not a fresh March context rebuild. |
| Pi / Provider wiring | Attach March system prompt, recall steer messages, hosted-tool payload adjustments, and provider guards at pi-agent extension hooks. |
| Tool boundary | Pass registered tools to pi-agent and observe tool execution events; do not own each capability's internal behavior. |

## Core does not own

| Area | Owner |
|---|---|
| Tool implementation details | Capability modules such as shell, memory, web, browser, image, avatar, and MCP. |
| Auth, config, logging, persistence, IPC | Infrastructure modules. |
| TUI / workspace rendering | CLI shell and workspace runtime. |
| Provider-specific product behavior | Provider modules and pi/provider integration hooks. |

## Current migration boundary

Today `createRunner` and session option resolution still receive many capability-specific services. Route 1 does not move those services yet. It establishes the rule for later changes:

> High-level runtime code wires capabilities; it must not absorb capability behavior.

The next cleanup route should convert the broad tool/service parameter list into a small Capability Registry contract without changing Agent Run semantics.
