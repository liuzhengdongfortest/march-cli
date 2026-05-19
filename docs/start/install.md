# Install March

March publishes an npm CLI for local terminal use. Install it globally, then start it from the project directory you want March to work in.

## Requirements

| Requirement | Notes |
| --- | --- |
| Node.js | Version 20 or newer. |
| Package manager | npm is the default path; pnpm or another Node package manager can also run the package. |
| Model provider | Configure at least one provider before regular use. |

## Install

Use the latest stable package unless you are intentionally testing a local build:

```bash
npm install -g march-cli
```

Then open a project and start March:

```bash
march
```

## Configure

March reads local configuration from your March config directory. Start with a model provider and add optional tools only when you need them.

- [Configure providers](/start/configuration)
- [Understand context assembly](/concepts/context)
- [Read about Markdown memory](/concepts/memory)

## Update

```bash
npm install -g march-cli@latest
```

## After Installing

1. Open a repository in your terminal.
2. Run `march`.
3. Ask March to inspect, explain, edit, or verify the project.
4. Keep project-specific instructions in `AGENTS.md` when you want them loaded as context.

## Next Step

Continue to [Configuration](/start/configuration).
