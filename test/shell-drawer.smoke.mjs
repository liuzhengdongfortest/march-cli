import { strict as assert } from "node:assert";

export async function runShellDrawerSmoke() {
  console.log("--- smoke: shell drawer ---");
  const { ShellDrawer } = await import("../src/cli/shell-drawer.mjs");

  const disabled = new ShellDrawer();
  assert.deepEqual(disabled.render(40), []);
  assert.equal(disabled.toggle(), true);
  assert.ok(disabled.render(40).join("\n").includes("disabled"));

  const sent = [];
  const runtime = {
    listShells: () => [{
      id: "sh1",
      name: "dev",
      status: "running",
      command: "powershell.exe",
      args: ["-NoLogo"],
    }],
    snapshotShell: () => ({ plain: "one\ntwo\nthree", ansi: "" }),
    sendShell: (id, data) => {
      sent.push([id, data]);
      return { ok: true };
    },
  };
  const drawer = new ShellDrawer({ shellRuntime: runtime, maxOutputLines: 2 });
  assert.equal(drawer.toggle(), true);
  const rendered = drawer.render(80).join("\n");
  assert.ok(rendered.includes("dev"));
  assert.ok(!rendered.includes("one"));
  assert.ok(rendered.includes("two"));
  assert.ok(rendered.includes("three"));
  assert.equal(drawer.isInputActive(), true);
  assert.deepEqual(drawer.sendInput("x"), { ok: true });
  assert.deepEqual(sent, [["sh1", "x"]]);

  console.log("  PASS");
}
