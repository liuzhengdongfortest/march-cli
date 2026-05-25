# CLI Workflow

March is designed to be used from the repository you are already working in.

```text
You → march in the project directory
      → March reads current project facts
      → March edits or runs commands through explicit tools
      → March reports the result
```

## Start a session

```bash
cd path/to/project
march
```

You can also send one prompt directly:

```bash
march "explain how this package starts"
```

Use `--provider` or `--model` when you want to override the configured default for the first model selection:

```bash
march --provider openai --model gpt-5.1
```

## What March sees

March does not assume the whole repository is already in the prompt. It starts with stable context, then reads files and command output when the task needs them.

That means a good request can be direct:

```text
Find where provider configuration is loaded and explain the flow.
```

March will locate the relevant files, open the parts it needs, and only then answer or edit.

## Common loop

1. Ask March to inspect or change something.
2. Let it read the relevant files.
3. Review the proposed or completed changes.
4. Let it run a focused check, usually the fast test script for day-to-day work.

For project-specific rules, keep an `AGENTS.md` file in the repository. March loads it as part of project context so repeated instructions do not have to be pasted into every prompt.

## Resume or inspect sessions

Use `--resume <id>` when you want to start from a previous pi session id:

```bash
march --resume <id>
```

For debugging prompt assembly, `--dump-context` writes prompts under `.march/context-dumps/`:

```bash
march --dump-context
```
