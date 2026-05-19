# Context Model

March treats context as reconstructed state, not a growing transcript.

```text
Stable instructions
  → Session identity
  → Recent chat summary
  → Memory hints
  → Tool-driven reads of current project facts
```

## Principle

The repository is the source of truth. March reads files and terminal state when needed instead of pinning stale snapshots in the prompt.

## Layers

- `system_core`: March behavior, safety rules, model-specific additions
- `injections`: explicit external instructions from MCP or extensions
- `session_identity`: cwd, workspace root, memory root, platform, shell
- `recent_chat`: recent turns plus compact recall hints

For the full design note, see [Context Core](/context-core).
