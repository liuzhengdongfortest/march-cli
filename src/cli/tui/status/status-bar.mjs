import { visibleWidth } from "@earendil-works/pi-tui";
import { statusBar, R } from "../ui-theme.mjs";

const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const DEFAULT_STATUS_TEXT = "March";
const DEFAULT_HELP_TEXT = "/ commands · ? help";
const INPUT_BG = "\x1b[48;2;32;34;38m";
const INPUT_PROMPT = "> ";
const HORIZONTAL_INSET = 2;

export class StatusBar {
  constructor(text = DEFAULT_STATUS_TEXT, { cwd = process.cwd(), helpText = DEFAULT_HELP_TEXT } = {}) {
    this.text = normalizeStatusText(text);
    this.cwd = normalizeStatusText(cwd);
    this.helpText = normalizeStatusText(helpText);
  }

  setText(text) {
    const next = normalizeStatusText(text);
    if (next === this.text) return false;
    this.text = next;
    return true;
  }

  setCwd(cwd) {
    const next = normalizeStatusText(cwd);
    if (next === this.cwd) return false;
    this.cwd = next;
    return true;
  }

  invalidate() {}

  render(width) {
    return this.renderTop(width);
  }

  renderTop(width) {
    if (width <= 0) return [""];
    const { left, innerWidth, right } = insetForWidth(width);
    const parts = statusParts(this.text);
    const cwdName = currentDirectoryName(this.cwd);
    const lsp = parts.lsp || "lsp:off";
    const leftText = [cwdName, lsp].filter(Boolean).join(" | ");
    const line = composeMetaLine({ left: leftText, right: parts.context, width: innerWidth });
    return [`${left}${line}${right}`, ""];
  }

  renderInputLines(lines, width) {
    if (width <= 0) return [""];
    const { left, innerWidth, right } = insetForWidth(width);
    const contentLines = lines.filter((line) => !isEditorChromeLine(line));
    const visibleLines = contentLines.length > 0 ? contentLines : [""];
    return visibleLines.map((line, index) =>
      `${left}${this.renderInputLine(line, innerWidth, { isFirst: index === 0 })}${right}`,
    );
  }

  renderInputLine(line, width, { isFirst = true } = {}) {
    if (width <= 0) return "";
    const prompt = isFirst ? statusBar.prompt(INPUT_PROMPT) : "  ";
    const promptWidth = visibleWidth(stripAnsi(INPUT_PROMPT));
    const maxContentWidth = Math.max(1, width - promptWidth - 2);
    const content = clipToWidth(line, maxContentWidth);
    return applyInputBackground(padToWidth(`${prompt}${content}`, width));
  }

  renderBottom(width) {
    if (width <= 0) return [""];
    const { left: insetLeft, innerWidth, right: insetRight } = insetForWidth(width);
    const parts = statusParts(this.text);
    const mode = parts.mode || DEFAULT_STATUS_TEXT;
    const activity = parts.activity ? `${parts.activity} · ` : "";
    const right = [parts.model, parts.thinking].filter(Boolean).join(" • ");
    const line = composeMetaLine({ left: `${activity}${mode}`, right, width: innerWidth });
    return ["", `${insetLeft}${line}${insetRight}`];
  }
}

function insetForWidth(width) {
  const safeWidth = Math.max(1, Math.trunc(width));
  const inset = safeWidth > HORIZONTAL_INSET * 2 + 12 ? HORIZONTAL_INSET : 0;
  const left = " ".repeat(inset);
  const right = " ".repeat(inset);
  return { left, innerWidth: Math.max(1, safeWidth - inset * 2), right };
}

function composeMetaLine({ left, right, width }) {
  const safeWidth = Math.max(1, Math.trunc(width));
  const rightWidth = visibleWidth(stripAnsi(right));
  if (!right) return statusBar.muted(padToWidth(clipToWidth(left, safeWidth), safeWidth));
  if (rightWidth >= safeWidth) return statusBar.muted(padToWidth(clipToWidth(right, safeWidth), safeWidth));

  const maxLeftWidth = Math.max(0, safeWidth - rightWidth - 1);
  const fittedLeft = maxLeftWidth > 0 ? clipToWidth(left, maxLeftWidth) : "";
  const gap = Math.max(1, safeWidth - visibleWidth(stripAnsi(fittedLeft)) - rightWidth);
  return `${statusBar.muted(fittedLeft)}${" ".repeat(gap)}${statusBar.muted(right)}${R}`;
}


function applyInputBackground(line) {
  return `${INPUT_BG}${String(line).replaceAll(R, `${R}${INPUT_BG}`)}${R}`;
}

function isEditorChromeLine(line) {
  const plain = stripAnsi(line).trim();
  return plain.length > 0 && (/^─+$/.test(plain) || /^─+\s[↑↓].*more\s─*$/.test(plain));
}

function currentDirectoryName(path) {
  const normalized = normalizeStatusText(path);
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) || normalized || DEFAULT_STATUS_TEXT;
}

function statusParts(text) {
  const segments = plainSegments(text);
  const runtime = segments.find((segment) => segment.includes("·")) || "";
  const [model = "", thinking = ""] = runtime.split("·").map((part) => part.trim());
  const lsp = segments.find((segment) => segment.startsWith("lsp:")) || "";
  const context = [...segments].reverse().find((segment) => /^\d+(?:\.\d+)?[KM]?$/.test(segment)) || "";
  const activity = segments.find((segment) => /(?:Working|Aborted)$/.test(segment)) || "";
  const mode = segments.find((segment) => segment && segment !== runtime && segment !== lsp && segment !== activity && segment !== context) || segments[0] || "";
  return { mode, model, thinking, lsp, activity, context };
}

function plainSegments(text) {
  return stripAnsi(normalizeStatusText(text))
    .split(" | ")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function normalizeStatusText(text) {
  const normalized = String(text || DEFAULT_STATUS_TEXT).replace(/\s+/g, " ").trim();
  return normalized || DEFAULT_STATUS_TEXT;
}

export function padToWidth(text, width) {
  const plainWidth = visibleWidth(stripAnsi(text));
  const padding = Math.max(0, width - plainWidth);
  return text + " ".repeat(padding);
}

export function fitStatusText(text, width) {
  const normalized = normalizeStatusText(text);
  if (visibleWidth(stripAnsi(normalized)) <= width) return normalized;

  const segments = normalized.split(" | ");
  if (segments.length < 2) return clipToWidth(normalized, width);

  const tail = segments.at(-1);
  const separator = " | ";
  const tailWidth = visibleWidth(stripAnsi(tail));
  const separatorWidth = visibleWidth(separator);
  if (tailWidth + separatorWidth >= width) return clipToWidth(tail, width);

  const headWidth = width - tailWidth - separatorWidth;
  const head = clipToWidth(segments.slice(0, -1).join(separator), headWidth);
  return `${head}${separator}${tail}`;
}

export function clipToWidth(text, width) {
  // For ANSI-containing text, build output character by character and measure plain width
  let output = "";
  let plainWidth = 0;
  let inAnsi = false;
  for (const ch of Array.from(String(text || ""))) {
    if (ch === "\x1b") inAnsi = true;
    if (inAnsi) {
      output += ch;
      if (/[@-~]/.test(ch)) inAnsi = false;
      continue;
    }
    const charWidth = visibleWidth(ch);
    if (plainWidth + charWidth > width) break;
    output += ch;
    plainWidth += charWidth;
  }
  return output;
}

function stripAnsi(text) {
  return String(text ?? "").replace(ANSI_RE, "");
}
