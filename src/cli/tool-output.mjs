export function extractToolOutput(result) {
  try {
    const content = result?.content;
    if (Array.isArray(content)) {
      return content.filter(c => c.type === "text").map(c => c.text).join("\n");
    }
  } catch {}
  return "";
}
