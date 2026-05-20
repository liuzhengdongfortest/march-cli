import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runRemoteMemorySmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: remote memory ---");
  const { createRemoteMemoryServer } = await import("../src/memory/remote/server.mjs");
  const { MarkdownMemoryStore } = await import("../src/memory/markdown-store.mjs");
  const { createMarkdownMemoryTools } = await import("../src/memory/markdown-tools.mjs");
  const { buildSessionIdentity } = await import("../src/context/session-status.mjs");
  const { runMemoryCommand } = await import("../src/memory/command.mjs");

  const remoteDir = setupTmp();
  const localDir = setupTmp();
  writeFileSync(join(remoteDir, "notes.md"), "# Team Notes\nRemote memory wraps rg over a folder.\nUse memory_open to read more.\n", "utf8");

  const remote = createRemoteMemoryServer({ root: remoteDir, name: "team-notes", token: "test-token" });
  await new Promise((resolve, reject) => {
    remote.server.once("error", reject);
    remote.server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = remote.server.address();
    const store = new MarkdownMemoryStore({ root: localDir, now: () => new Date("2026-05-20T10:00:00.000Z") });
    store.save({ name: "Local note", description: "Local search source", body: "local-only memory text", tags: ["local"] });
    const tools = createMarkdownMemoryTools(store, {
      remoteSources: [{ name: "team-notes", url: `http://127.0.0.1:${address.port}`, token: "test-token" }],
    });
    const search = tools.find((tool) => tool.name === "memory_search");
    const open = tools.find((tool) => tool.name === "memory_open");

    const remoteSearch = await search.execute("r1", { source: "team-notes", query: "Remote memory", context: 1, limit: 5 });
    assert.ok(remoteSearch.content[0].text.includes("team-notes: notes.md:2"));
    assert.ok(remoteSearch.content[0].text.includes("2 | Remote memory wraps rg over a folder."));
    assert.ok(remoteSearch.content[0].text.includes("Open: memory_open source=\"team-notes\" path=\"notes.md\" line=2"));

    const remoteOpen = await open.execute("r2", { source: "team-notes", path: "notes.md", line: 2, context: 0 });
    assert.ok(remoteOpen.content[0].text.includes("Remote memory is read-only."));
    assert.ok(remoteOpen.content[0].text.includes("Remote memory wraps rg over a folder."));

    const allSearch = await search.execute("r3", { source: "all", query: "memory", syntax: "literal", limit: 10 });
    assert.ok(allSearch.content[0].text.includes("local:"));
    assert.ok(allSearch.content[0].text.includes("team-notes:"));

    const identity = buildSessionIdentity({ cwd: "/repo", memoryRoot: localDir, remoteMemorySources: [{ name: "team-notes" }], platform: "linux" });
    assert.ok(identity.includes("remote_memories:"));
    assert.ok(identity.includes("- team-notes"));

    const commandHome = setupTmp();
    const output = [];
    const stdout = { write: (text) => output.push(text) };
    const stderr = { write: (text) => output.push(text) };
    assert.equal(await runMemoryCommand({ command: { name: "memory", args: ["add", `http://127.0.0.1:${address.port}?token=test-token`] }, name: "team-notes" }, { homeDir: commandHome, stdout, stderr }), 0);
    assert.equal(await runMemoryCommand({ command: { name: "memory", args: ["list"] } }, { homeDir: commandHome, stdout, stderr }), 0);
    assert.ok(output.join("").includes("team-notes"));
    assert.equal(await runMemoryCommand({ command: { name: "memory", args: ["remove", "team-notes"] } }, { homeDir: commandHome, stdout, stderr }), 0);
    cleanup(commandHome);

    store.close();
  } finally {
    await new Promise((resolve) => remote.server.close(resolve));
    cleanup(remoteDir);
    cleanup(localDir);
  }

  console.log("  PASS");
}
