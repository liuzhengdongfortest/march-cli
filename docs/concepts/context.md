# Context Model

March treats the initial Agent Run context as reconstructed state. During an Agent Run, pi-agent advances by appending transcript entries for model output, tool calls, tool results, and hidden steer messages.

```text
Stable instructions
  → Session identity
  → Recent chat summary
  → Recall hints
  → Tool-driven reads of current project facts
```

## Principle

The repository is the source of truth. March reads files and terminal state when needed instead of pinning stale snapshots in the prompt.

## Layers

- `system_core`: March behavior, safety rules, model-specific additions
- `injections`: explicit external instructions from MCP or extensions
- `session_identity`: cwd, workspace root, memory root, platform, shell
- `recent_chat`: recent Agent Runs plus compact recall hints

For the runtime boundary, see [Runtime Core Boundary](/concepts/runtime-core). For the full design note, see [Context Core](/context-core).
