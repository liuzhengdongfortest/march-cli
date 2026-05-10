import { strict as assert } from "node:assert";

export async function runContextShellLayersSmoke() {
  console.log("--- smoke: context shell layers ---");
  const { buildShellLayers } = await import("../src/context/shell-layers.mjs");

  assert.deepEqual(buildShellLayers({ shellRuntime: null }), []);
  assert.deepEqual(buildShellLayers({ shellRuntime: { listShells: () => [] } }), []);

  const layers = buildShellLayers({
    shellRuntime: {
      listShells: () => [
        { id: "sh1", name: "dev", status: "running", command: "powershell.exe", args: ["-NoLogo"], cwd: "D:/repo", lineCount: 3 },
        { id: "sh2", name: "empty", status: "exited", command: "cmd.exe", args: [], cwd: "D:/repo", lineCount: 0 },
      ],
      snapshotShell: (id) => ({
        plain: id === "sh1" ? "ready" : "",
        ansi: "\x1b[32mready\x1b[0m",
      }),
    },
  });

  assert.equal(layers.length, 1);
  assert.ok(layers[0].startsWith("[shells]"));
  assert.ok(layers[0].includes("## dev (sh1)"));
  assert.ok(layers[0].includes("command: powershell.exe -NoLogo"));
  assert.ok(layers[0].includes("recent_output:\nready"));
  assert.ok(layers[0].includes("## empty (sh2)"));
  assert.ok(layers[0].includes("recent_output:\n(no output)"));
  assert.ok(!layers[0].includes("\x1b[32m"));

  const truncated = buildShellLayers({
    shellRuntime: {
      listShells: () => [{ id: "sh1", name: "dev", status: "running", command: "pwsh", args: [], cwd: "D:/repo", lineCount: 1 }],
      snapshotShell: () => ({ plain: "abcdef" }),
    },
    truncateText: (text, maxLen) => `${text.slice(0, 3)}:${maxLen}`,
  });
  assert.ok(truncated[0].includes("abc:2000"));
  console.log("  PASS");
}
