import { createInterface } from "node:readline";
import { selectWithKeyboard } from "../cli/input/select-with-keyboard.mjs";
import { globalConfigJsonPath, upsertWebSearchProvider } from "../config/config-json.mjs";
import { WEB_SEARCH_PRESETS } from "./presets.mjs";

export async function runWebSearchConfigCommand({
  homeDir,
  input = process.stdin,
  output = process.stdout,
  select = selectWithKeyboard,
  readSecret = readLine,
} = {}) {
  const preset = await select({
    input,
    output,
    message: "Choose web search provider to configure",
    items: WEB_SEARCH_PRESETS.map((item) => ({ label: item.label, value: item })),
  });
  if (!preset) {
    output.write("Web search configuration cancelled.\n");
    return 1;
  }

  const apiKey = String(await readSecret({ input, output, prompt: `${preset.apiKeyLabel}: ` }) ?? "").trim();
  if (!apiKey) {
    output.write("API key is required.\n");
    return 1;
  }

  const path = globalConfigJsonPath(homeDir);
  upsertWebSearchProvider({ path, id: preset.id, apiKey });
  output.write(`Saved web search provider: ${preset.label}\n`);
  output.write(`Config: ${path}\n`);
  return 0;
}

function readLine({ input = process.stdin, output = process.stdout, prompt }) {
  const rl = createInterface({ input, output });
  return new Promise((resolve) => rl.question(prompt, (answer) => {
    rl.close();
    resolve(answer);
  }));
}
