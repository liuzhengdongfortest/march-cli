export const WEB_SEARCH_PRESETS = [
  {
    id: "tavily",
    label: "Tavily",
    apiKeyLabel: "Tavily API key",
  },
  {
    id: "brave",
    label: "Brave Search",
    apiKeyLabel: "Brave Search API key",
  },
];

export function getWebSearchPreset(id) {
  return WEB_SEARCH_PRESETS.find((preset) => preset.id === id) ?? null;
}
