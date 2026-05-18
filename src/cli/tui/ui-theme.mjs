// ── SGR constants ────────────────────────────────────────────────────
const R = "\x1b[0m";
const B = "\x1b[1m";
const D = "\x1b[2m";

// Standard 16 colors
const black = (s) => `\x1b[30m${s}${R}`;
const red = (s) => `\x1b[31m${s}${R}`;
const green = (s) => `\x1b[32m${s}${R}`;
const yellow = (s) => `\x1b[33m${s}${R}`;
const blue = (s) => `\x1b[34m${s}${R}`;
const magenta = (s) => `\x1b[35m${s}${R}`;
const cyan = (s) => `\x1b[36m${s}${R}`;
const white = (s) => `\x1b[37m${s}${R}`;
const brightBlack = (s) => `\x1b[90m${s}${R}`;
const brightRed = (s) => `\x1b[91m${s}${R}`;
const brightGreen = (s) => `\x1b[92m${s}${R}`;
const orange = (s) => `\x1b[38;2;245;167;66m${s}${R}`;
const softGreen = (s) => `\x1b[38;2;127;216;143m${s}${R}`;
const violet = (s) => `\x1b[38;2;232;91;226m${s}${R}`;

// ── Formatters ───────────────────────────────────────────────────────
const bold = (s) => `${B}${s}${R}`;
const dim = (s) => `${D}${s}${R}`;
const inverse = (s) => `\x1b[7m${s}${R}`;

// ── 256-color helpers ────────────────────────────────────────────────
const fg256 = (n) => (s) => `\x1b[38;5;${n}m${s}${R}`;
const bg256 = (n) => (s) => `\x1b[48;5;${n}m${s}${R}`;

// ── Semantic tokens ──────────────────────────────────────────────────
const text = {
  primary: white,
  secondary: (s) => fg256(250)(s),   // light gray
  muted: brightBlack,
  inverse: black,
};

const surface = {
  base: (s) => s,                     // default terminal bg
  raised: bg256(236),                 // dark gray bg
  overlay: bg256(238),
};

const accent = {
  primary: cyan,
  success: green,
  error: red,
  warning: yellow,
  info: blue,
};

const border = {
  default: brightBlack,
  focus: cyan,
};

// ── Component tokens ─────────────────────────────────────────────────
const diff = {
  add: green,
  del: red,
  ctx: brightBlack,
  header: bold,
  gutter: brightBlack,
};

const tool = {
  name: brightBlack,
  args: brightBlack,
  result: dim,
  error: red,
  expand: brightBlack,
};

const message = {
  user: bold,
  assistant: (s) => s,
  system: brightBlack,
  separator: brightBlack,
};

const statusBar = {
  muted: brightBlack,
  cwd: fg256(250),
  prompt: fg256(250),
  accent: violet,
};

const shell = {
  header: bold,
  divider: fg256(238),
  prompt: green,
  scrollInfo: brightBlack,
};

const spinner = {
  frame: cyan,
};

const selectList = {
  selectedPrefix: cyan,
  selectedText: white,
  description: brightBlack,
  scrollInfo: brightBlack,
  noMatch: brightBlack,
};

// ── Editor theme (consumed by pi-tui Editor component) ──────────────
const EDITOR_THEME = {
  borderColor: fg256(238),
  selectList,
};

// ── Raw ANSI prefixes (for template literal composition) ─────────────
const PREFIX = {
  reset: R,
  bold: B,
  dim: D,
  fg250: "\x1b[38;5;250m",   // header / secondary text
  fg238: "\x1b[38;5;238m",   // border / divider
  brightBlack: "\x1b[90m",    // muted text
  cyan: "\x1b[36m",           // active / accent
};

// ── Public API ───────────────────────────────────────────────────────
export {
  PREFIX,
  // SGR primitives
  R, B, D,
  black, red, green, yellow, blue, magenta, cyan, white,
  brightBlack, brightRed, brightGreen,
  orange, softGreen, violet,
  bold, dim, inverse,
  fg256, bg256,
  // Semantic
  text,
  surface,
  accent,
  border,
  // Components
  diff,
  tool,
  message,
  statusBar,
  shell,
  spinner,
  selectList,
  // Editor
  EDITOR_THEME,
};
