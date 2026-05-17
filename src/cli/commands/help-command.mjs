export function formatHelpLines() {
  return [
    "Commands: /new, /exit, /help, /hotkeys, /templates, /export jsonl, /export html, /export gist <jsonl|html>, /settings, /extensions, /providers, /providers <name>, /model, /models, /session, /status, /shell, /shell spawn [name], /save, /name, /copy, /mouse",
    "Sessions: /session opens previous sessions and restores the selected one.",
    "Shortcuts: Tab = toggle Do/Discuss, Esc = abort turn, Ctrl+C = abort turn/exit when idle, Ctrl+O = toggle tool output, Alt+S = shell pane, Alt+N = next shell, Alt+K/J = shell scroll, PageUp/PageDown = output scroll, Ctrl+G = external editor, Shift+Tab = thinking selector, Ctrl+T = thinking selector, Ctrl+L = model selector",
  ];
}
