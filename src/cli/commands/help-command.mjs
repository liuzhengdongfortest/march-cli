export function formatHelpLines() {
  return [
    "Commands: /exit, /help, /hotkeys, /templates, /export jsonl, /export html, /export gist <jsonl|html>, /settings, /extensions, /providers, /providers <name>, /model, /models, /compact, /session, /session entries, /sessions, /sessions tree, /sessions pi, /sessions legacy, /resume <id>, /resume-pi <id>, /resume-legacy <id>, /clone-pi, /fork-pi, /fork, /fork-legacy, /status, /shell, /shell spawn [name], /save, /name, /copy, /mouse, /pin <path>, /unpin <path>, /pins",
    "Sessions: /sessions and /resume <id> use default pi JSONL sessions; /sessions pi and /resume-pi <id> are explicit pi aliases; legacy .march/sessions use /sessions legacy, /resume-legacy <id>, /fork-legacy, or --legacy-sessions.",
    "Branches: /clone-pi clones the current pi branch; /session entries and /fork-pi list in-file entry candidates; /fork-pi requires --reset-context to write a historical fork.",
    "Shortcuts: Esc = abort turn, Ctrl+C = abort turn/exit when idle, Ctrl+O = toggle tool output, Alt+S = shell pane, Alt+N = next shell, Alt+K/J = shell scroll, Ctrl+G = external editor, Shift+Tab = cycle thinking, Ctrl+T = thinking selector, Ctrl+L = model selector",
  ];
}
