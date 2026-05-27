import { formatRecallHints } from "../../../memory/markdown-store.mjs";

export function createRecallCustomMessage(hints, { source } = {}) {
  const content = formatRecallHints(hints ?? []);
  if (!content) return null;
  return {
    customType: "march.recall",
    content,
    display: false,
    details: { type: "recall", source },
  };
}
