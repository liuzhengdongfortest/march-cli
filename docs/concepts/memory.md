# Memory System

March stores long-lived knowledge as Markdown files.

```text
Markdown memory files
  → Frontmatter parser
  → Disposable search index
  → Recall hint
  → memory_open when the full note is needed
```

## What gets remembered

Good memories are stable facts, reusable decisions, project conventions, or lessons from a detour.

## What does not get injected

March does not dump memory bodies into every prompt. It first recalls compact hints, then opens the exact note only when the task needs it.

## Storage

By default, memories live under the March memory root. The files are ordinary Markdown, so users can inspect and edit them directly.

For the full design note, see [Markdown Memory System](/markdown-memory-system).
