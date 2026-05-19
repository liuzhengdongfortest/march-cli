---
layout: home

hero:
  name: March CLI
  text: Code with context that doesn't rot.
  tagline: Terminal-native coding agent with context reconstruction, Markdown memory, shell tools, MCP, and web search.
  actions:
    - theme: brand
      text: Install March
      link: /start/install
    - theme: alt
      text: Learn the model
      link: /concepts/context

features:
  - title: Fresh context every turn
    details: March rebuilds prompt context from stable layers and current project facts instead of letting chat history grow forever.
  - title: Markdown memory
    details: Memories are ordinary Markdown files, recalled on demand as lightweight hints and opened only when needed.
  - title: Terminal-native work
    details: March reads, edits, runs commands, verifies changes, and reports exactly what happened.
---

## The shape

```text
User request
  → March context assembly
  → Model call with tools
  → Repository edits / terminal verification
  → Concise final report
```

March keeps the system small on purpose: source files are the truth, memory files are readable, and runtime caches are disposable.
