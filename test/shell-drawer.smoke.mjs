import { strict as assert } from "node:assert";

export async function runShellDrawerSmoke() {
  console.log("--- smoke: shell drawer ---");
  const { ShellDrawer, formatAnsiLines, sanitizeAnsiForDrawer } = await import("../src/cli/shell-drawer.mjs");

  const disabled = new ShellDrawer();
  assert.deepEqual(disabled.render(40), []);
  assert.equal(disabled.toggle(), true);
  assert.ok(disabled.render(40).join("\n").includes("disabled"));
  assert.ok(disabled.render(80).join("\n").includes("focus:editor"));

  const sent = [];
  const snapshots = {
    sh1: "zero\none\ntwo\nthree",
    sh2: "alpha\nbeta",
  };
  const runtime = {
    listShells: () => [
      {
        id: "sh1",
        name: "dev",
        status: "running",
        command: "powershell.exe",
        args: ["-NoLogo"],
      },
      {
        id: "sh2",
        name: "test",
        status: "exited",
        command: "node",
        args: [],
      },
    ],
    snapshotShell: (id) => ({ plain: snapshots[id], ansi: "" }),
    sendShell: (id, data) => {
      sent.push([id, data]);
      return { ok: true };
    },
  };
  const drawer = new ShellDrawer({ shellRuntime: runtime, maxOutputLines: 2 });
  assert.equal(drawer.toggle(), true);
  const rendered = drawer.render(80).join("\n");
  assert.ok(rendered.includes("dev"));
  assert.ok(rendered.includes("1/2"));
  assert.ok(rendered.includes("tail"));
  assert.ok(rendered.includes("focus:shell"));
  assert.ok(!rendered.includes("one"));
  assert.ok(rendered.includes("two"));
  assert.ok(rendered.includes("three"));
  assert.equal(drawer.isInputActive(), true);
  assert.deepEqual(drawer.sendInput("x"), { ok: true });
  assert.deepEqual(sent, [["sh1", "x"]]);
  assert.deepEqual(drawer.scroll(-1), { offset: 1, maxOffset: 2, atTail: false });
  const scrolled = drawer.render(80).join("\n");
  assert.ok(scrolled.includes("-1"));
  assert.ok(scrolled.includes("one"));
  assert.ok(scrolled.includes("two"));
  assert.ok(!scrolled.includes("three"));
  assert.deepEqual(drawer.scroll(1), { offset: 0, maxOffset: 2, atTail: true });
  assert.equal(drawer.selectNextShell().id, "sh2");
  const nextRendered = drawer.render(80).join("\n");
  assert.ok(nextRendered.includes("test"));
  assert.ok(nextRendered.includes("2/2"));
  assert.ok(nextRendered.includes("alpha"));

  const ansiLines = formatAnsiLines({
    ansi: "\x1b[?25l\x1b[31mred\x1b[0m\n\x1b]0;title\x07done",
    plain: "plain",
  });
  assert.deepEqual(ansiLines, ["\x1b[31mred\x1b[0m", "done"]);
  assert.equal(sanitizeAnsiForDrawer("\x1b[2J\x1b[32mok\x1b[0m"), "\x1b[32mok\x1b[0m");
  assert.deepEqual(formatAnsiLines({ plain: "fallback" }), ["fallback"]);

  console.log("  PASS");
}
