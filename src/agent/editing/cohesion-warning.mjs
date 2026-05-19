import { extname, normalize } from "node:path";

const MAX_COHESIVE_LINES = 300;
const MIN_ADDED_LINES = 40;

const CODE_EXTENSIONS = new Set([
  ".cjs",
  ".go",
  ".js",
  ".jsx",
  ".mjs",
  ".py",
  ".rs",
  ".ts",
  ".tsx",
]);

const IGNORED_SEGMENTS = new Set([
  "build",
  "coverage",
  "dist",
  "fixture",
  "fixtures",
  "node_modules",
  "vendor",
]);

export function buildCohesionWarning({ path, oldText, newText }) {
  if (!shouldCheckPath(path)) return null;

  const oldLines = countLines(oldText);
  const newLines = countLines(newText);
  const addedLines = Math.max(0, newLines - oldLines);
  if (newLines <= MAX_COHESIVE_LINES || addedLines < MIN_ADDED_LINES) return null;

  return [
    "[cohesion]",
    `${formatPath(path)} is now ${newLines} lines after a +${addedLines} line edit.`,
    "If the added logic is a separate responsibility, extract it into a cohesive module before continuing.",
  ].join("\n");
}

function shouldCheckPath(path) {
  const normalized = normalize(path).replaceAll("\\", "/");
  if (normalized.includes(".generated.")) return false;
  if (!CODE_EXTENSIONS.has(extname(normalized))) return false;
  return !normalized.split("/").some((segment) => IGNORED_SEGMENTS.has(segment));
}

function countLines(text) {
  if (!text) return 0;
  return String(text).split("\n").length;
}

function formatPath(path) {
  return String(path).replaceAll("\\", "/");
}
