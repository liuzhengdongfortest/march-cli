export function formatHelpLines() {
  return [
    "Commands: /exit, /help, /hotkeys, /templates, /export jsonl, /export html, /export gist <jsonl|html>, /settings, /extensions, /providers, /providers <name>, /model, /models, /session, /session entries, /sessions, /sessions tree, /sessions pi, /resume <id>, /resume-pi <id>, /clone-pi, /fork-pi, /fork, /status, /shell, /shell spawn [name], /save, /name, /copy, /mouse, /pin <path>, /unpin <path>, /pins",
    "Branches: /clone-pi clones the current pi branch; /session entries and /fork-pi list in-file entry candidates; /fork-pi requires --reset-context to write a historical fork.",
    "Shortcuts: Tab = toggle Do/Discuss, Esc = abort turn, Ctrl+C = abort turn/exit when idle, Ctrl+O = toggle tool output, Alt+S = shell pane, Alt+N = next shell, Alt+K/J = shell scroll, Ctrl+G = external editor, Shift+Tab = cycle thinking, Ctrl+T = thinking selector, Ctrl+L = model selector",
  ];
}
