import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_KEYBINDINGS = Object.freeze({
  abort: "Esc",
  interrupt: "Ctrl+C",
  cycleThinking: "Shift+Tab",
  thinkingSelector: "Ctrl+T",
  modelSelector: "Ctrl+L",
  externalEditor: "Ctrl+G",
  toggleToolOutput: "Ctrl+O",
  toggleShellDrawer: "Alt+S",
  nextShell: "Alt+N",
  pasteImage: "Alt+V",
});

export const KEYBINDING_ACTIONS = Object.freeze({
  abort: "Abort current turn; cancel retry wait",
  interrupt: "Abort current turn or exit when idle",
  cycleThinking: "Cycle thinking level",
  thinkingSelector: "Open thinking selector",
  modelSelector: "Open model selector",
  externalEditor: "Open external editor ($VISUAL or $EDITOR)",
  toggleToolOutput: "Toggle tool output collapsed/expanded",
  toggleShellDrawer: "Toggle shell drawer",
  nextShell: "Select next shell in drawer",
  pasteImage: "Paste clipboard image as attachment",
});

export function loadKeybindings(cwd) {
  return loadKeybindingsFromPath(resolve(cwd, ".march", "keybindings.json"));
}

export function loadKeybindingsFromPath(path) {
  if (!existsSync(path)) {
    return { keybindings: { ...DEFAULT_KEYBINDINGS }, diagnostics: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return normalizeKeybindings(parsed, path);
  } catch (err) {
    return {
      keybindings: { ...DEFAULT_KEYBINDINGS },
      diagnostics: [{ type: "warning", message: `Failed to load keybindings.json: ${err.message}`, path }],
    };
  }
}

export function normalizeKeybindings(parsed, path = "keybindings.json") {
  const diagnostics = [];
  const keybindings = { ...DEFAULT_KEYBINDINGS };
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      keybindings,
      diagnostics: [{ type: "warning", message: "keybindings.json must be an object", path }],
    };
  }

  for (const [action, key] of Object.entries(parsed)) {
    if (!Object.hasOwn(KEYBINDING_ACTIONS, action)) {
      diagnostics.push({ type: "warning", message: `Unknown keybinding action: ${action}`, path });
      continue;
    }
    if (!isSupportedKey(key)) {
      diagnostics.push({ type: "warning", message: `Unsupported keybinding for ${action}: ${String(key)}`, path });
      continue;
    }
    keybindings[action] = key;
  }

  return { keybindings, diagnostics };
}

export function formatKeybindingLines(keybindings = DEFAULT_KEYBINDINGS) {
  return Object.entries(KEYBINDING_ACTIONS).map(([action, description]) =>
    `  ${padKey(keybindings[action] ?? DEFAULT_KEYBINDINGS[action])} ${description}`
  );
}

function isSupportedKey(key) {
  return typeof key === "string" && /^(Esc|Shift\+Tab|Ctrl\+[A-Z]|Alt\+[A-Z])$/.test(key);
}

function padKey(key) {
  return key.padEnd(10, " ");
}
