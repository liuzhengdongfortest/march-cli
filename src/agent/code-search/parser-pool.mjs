import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Language, Parser } from "web-tree-sitter";
import { canParseLanguage, languageConfig } from "./languages.mjs";

const RESOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../cli/tui/syntax/tree-sitter");

let initPromise = null;
const parsers = new Map();

export async function getParser(language) {
  if (!canParseLanguage(language)) return null;
  if (!initPromise) initPromise = Parser.init().catch(() => false);
  const ready = await initPromise;
  if (ready === false) return null;
  if (parsers.has(language)) return parsers.get(language);

  try {
    const config = languageConfig(language);
    const grammar = await Language.load(join(RESOURCE_DIR, config.file));
    const parser = new Parser();
    parser.setLanguage(grammar);
    parsers.set(language, parser);
    return parser;
  } catch {
    parsers.set(language, null);
    return null;
  }
}
