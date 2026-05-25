# Token Efficiency

Most coding agents slowly fill the prompt with old conversation, old tool output, and old guesses about the repository. March takes the opposite path: every turn should start from a small, clean context and rebuild the facts it needs.

```text
Previous turn
  → keep the user request and final answer
  → discard intermediate tool noise
  → next turn rebuilds current facts from the repo
```

## The core idea

A repository is already a database of the project. The prompt does not need to become a second, stale copy of it.

March keeps stable instructions and recent conversation, then reads files, command output, memory notes, and browser state only when they are relevant to the current task.

## What gets smaller

March tries not to carry these across turns:

- long command output that was only useful during debugging
- intermediate failed attempts
- file snapshots that may already be stale
- entire memory bodies when a short recall hint is enough
- unrelated tool results from previous work

This keeps ordinary model calls closer to the model's useful working range.

## What still persists

Token efficiency does not mean amnesia. March keeps durable state in places that are easier to inspect than a giant prompt:

- source files in the repository
- `AGENTS.md` for project instructions
- Markdown memory files for long-lived preferences and decisions
- session history for recent user and assistant messages
- optional context dumps when debugging prompt assembly

## Why not just summarize everything?

Summaries are useful, but they are not the source of truth. A summary can preserve the wrong detail, drop the important one, or keep describing code that has since changed.

March uses summaries and recall hints as pointers. When correctness matters, it goes back to the actual file, command, or memory note.

## Practical effect

For users, the effect is simple: you can keep working without the agent drowning in yesterday's terminal output. If the next task needs an old decision, March can recall or open it. If the next task needs current code, March reads the current code.
