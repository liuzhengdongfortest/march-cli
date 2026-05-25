# Tools

March keeps capabilities explicit. Reading a file, editing code, running a command, opening memory, searching code, or using the browser is a visible tool call rather than hidden background behavior.

```text
Request
  → decide what current facts are needed
  → call a tool with a narrow input
  → use the result to continue
```

## File and terminal tools

March can read files, inspect images, apply targeted edits, and run commands in the project directory. For long-running or interactive work, it can use an interactive terminal instead of a one-shot command.

The important boundary is simple: files and command output are current project facts. March should read them before making claims or edits.

## Code search

`code_search` is a native workspace search tool for finding unknown entry points, cross-module flows, and related implementations.

Use it as a map, not as proof. After search returns likely files, March should open the relevant files with `read` or confirm exact text with `grep` before editing or making a precise claim.

## Memory tools

Memory is stored as Markdown. March uses:

- `memory_search` to search memory files with ripgrep-style matching
- `memory_open` to read a specific memory note
- `memory_save` to create or update durable memory
- `memory_delete` to soft-delete local memory

Memory hints are small by design. The full note is opened only when the task actually needs it.

## Browser and web tools

When configured, March can use browser tools for real rendered pages and web tools for current information. These are still explicit tool calls, so the transcript shows when external state influenced the answer.

## Media tools

March can inspect local images and, when image generation credentials are configured, generate images through the `image_generate` tool. Existing media can be delivered with `send_binary`.

## Why this matters

Explicit tools make the work auditable. If March changed a file, ran a command, or used outside information, there is a visible step for it. That is slower than pretending everything is already known, but it makes the answer easier to trust.
