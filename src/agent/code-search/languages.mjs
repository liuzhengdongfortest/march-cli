import { extname } from "node:path";
import { LANG_ALIASES, LANGUAGES } from "../../cli/tui/syntax/languages.mjs";

export const SEARCHABLE_TEXT_EXTENSIONS = new Set([
  ".md", ".mdx", ".txt", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".xml", ".html", ".css",
]);

export function languageForPath(path) {
  const ext = extname(path).slice(1).toLowerCase();
  if (!ext) return "";
  return LANG_ALIASES.get(ext) ?? "";
}

export function canParseLanguage(language) {
  return Boolean(language && LANGUAGES[language]);
}

export function isSearchableTextPath(path) {
  const ext = extname(path).toLowerCase();
  return SEARCHABLE_TEXT_EXTENSIONS.has(ext) || canParseLanguage(languageForPath(path));
}

export function languageConfig(language) {
  return LANGUAGES[language] ?? null;
}
