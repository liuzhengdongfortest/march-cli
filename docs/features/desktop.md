# Desktop App

March desktop is an Electron shell around the local Web UI runtime. The desktop app keeps the agent runtime local and uses a native window instead of a browser tab.

```text
Desktop window
  → local March Web runtime
  → selected workspace session
```

## Run in development

```bash
npm run desktop:dev
```

Open an initial workspace:

```bash
npm run desktop:dev -- --workspace path/to/project
```

## Run against a production Web UI build

```bash
npm run desktop
```

## Boundary

The desktop layer owns only native-window concerns:

- window lifecycle
- local URL loading
- external-link handoff
- startup and shutdown of the local Web UI runtime

Agent behavior, provider configuration, memory, tools, and workspace sessions stay in the shared March runtime.
