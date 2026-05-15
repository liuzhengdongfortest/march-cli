import { permissionLabel } from "../permissions.mjs";
import { formatToolStartLine } from "./tool-rendering.mjs";
import { brightBlack, yellow } from "./ui-theme.mjs";

export async function requestToolPermission({ toolName, params, category, output, selectList, requestRender }) {
  const label = permissionLabel(category);
  output.writeln(yellow(`● ${toolName} needs ${label} permission`));
  output.writeln(brightBlack(`  ${formatToolStartLine(toolName, params)}`));
  requestRender();
  const choice = await selectList({
    items: [
      { label: "Approve once", description: `Allow ${toolName} this time (${label})` },
      { label: "Deny", description: "Block this tool call" },
    ],
    width: 58,
  });
  return choice?.label === "Approve once";
}
