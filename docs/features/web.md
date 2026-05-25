# Web UI

March also includes a local Web UI session manager. The Web UI is for managing and opening local March sessions from a browser while keeping the same provider, memory, and project model.

```text
march web
  → local session manager
  → browser UI
  → March runtime for selected workspace
```

## Start the Web UI

```bash
march web
```

Open an initial workspace:

```bash
march web --workspace path/to/project
```

Bind to a different host or port when needed:

```bash
march web --host 127.0.0.1 --port 3000
```

## Development mode

For working on the Web UI itself, use Vite hot reload:

```bash
march web --dev
```

You can also set the backend API port:

```bash
march web --dev --api-port 4317
```

## Same core model

The Web UI is not a second agent architecture. It uses the same basic March model:

- configured providers and selected models
- repository-local workspaces
- explicit tool calls
- Markdown memory
- context assembled per model call

Use the terminal CLI when you want the shortest path inside a repository. Use the Web UI when session management and browser-based inspection are more convenient.
