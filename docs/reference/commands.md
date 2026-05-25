# CLI Commands

This page lists the user-facing March commands and options exposed by the CLI help.

## Main usage

```bash
march [options] [prompt]
march [options]
```

Without a prompt, March starts an interactive REPL in the current directory. With a prompt, March handles that request directly.

## Provider commands

```bash
march provider --config
march provider remove
march provider share [id]
march provider accept <token>
march login [provider]
```

- `provider --config` opens interactive provider credential configuration.
- `provider remove` removes a configured provider interactively.
- `provider share [id]` creates a provider share token. Add `--include-key` to include the API key, or `--profile-only` to omit it.
- `provider accept <token>` imports a shared provider profile.
- `login [provider]` logs in to an OAuth provider.

## Web UI

```bash
march web [path]
march web --dev
```

Useful options:

- `--host <host>` binds the Web UI host.
- `--port <port>` binds the Web UI port.
- `--workspace <path>` opens an initial workspace session.
- `--api-port <port>` sets the API backend port in development mode.

## Web search

```bash
march websearch --config
```

Configures web search credentials.

## Memory commands

```bash
march memory serve [folder]
march memory add <url>
march memory list
march memory remove <name>
```

- `serve` exposes a memory folder as a remote memory source.
- `add` registers a remote memory URL.
- `list` lists configured remote memories.
- `remove` removes a remote memory source from config.

Useful options:

- `--host <host>` and `--port <port>` for `serve`
- `--name <name>` for `serve` and `add`
- `--foreground` for running a memory server in the current process

## Browser commands

```bash
march browser install
march browser status
march browser restart
```

These manage the developer browser extension and browser daemon used by browser tools.

## Gateway commands

```bash
march gateway setup
march gateway status
```

These configure and inspect gateway integration.

## Common options

| Option | Meaning |
| --- | --- |
| `-m, --model <id>` | Initial model id override |
| `--provider <name>` | Initial provider override |
| `--resume <id>` | Resume a pi session by id |
| `--json` | JSON output mode without TUI |
| `--dump-context` | Write every model prompt under `.march/context-dumps/` |
| `--shell-runtime` | Enable interactive PTY shell tools |
| `--no-shell-runtime` | Disable interactive PTY shell tools and shell pane |
| `-e, --extension <path>` | Load a pi extension path; repeatable |
| `-h, --help` | Show CLI help |
| `-v, --version` | Show version |
