# March CLI

March is a terminal-native coding agent that rebuilds context for every turn, works directly in your repository, and stores long-term knowledge as Markdown.

## Start Here

- [Install March](/start/install)
- [Configure providers](/start/configuration)
- [Understand the context model](/concepts/context)
- [Read about Markdown memory](/concepts/memory)

## What March Keeps Simple

| Area | Approach |
| --- | --- |
| Context | Reassembled from stable layers before each model call. |
| Memory | Stored as ordinary Markdown files and recalled as lightweight hints. |
| Tools | File edits, terminal commands, web access, and MCP integrations are explicit tool calls. |
| Verification | Relevant tests or checks are run after code changes when practical. |

## How A Turn Works

```text
User request
  → Context assembly
  → Model call
  → Tool calls when needed
  → Verification
  → Final report
```

March is designed around readable source, clear boundaries, and disposable runtime state.
