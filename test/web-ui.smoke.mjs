import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveStaticPath } from "../src/web-ui/server.mjs";

export async function runWebUiSmoke({ cwd = process.cwd() } = {}) {
  console.log("--- smoke: web UI prototype ---");
  const root = join(cwd, "src", "web-ui", "static");
  const html = readFileSync(join(root, "index.html"), "utf8");
  const css = readFileSync(join(root, "styles.css"), "utf8");
  const js = readFileSync(join(root, "app.js"), "utf8");

  assert.match(html, /class="app-shell"/);
  assert.match(html, /class="panel left-panel"/);
  assert.match(html, /aria-label="Projects"/);
  assert.match(html, /class="projects-header"/);
  assert.match(html, /class="project-tree"/);
  assert.match(html, /class="tree-row selected root-node"/);
  assert.match(html, /styles\.css/);
  assert.match(html, /class="timeline"/);
  assert.match(html, /class="main-header"/);
  assert.match(html, /class="panel right-panel"/);
  assert.match(html, /class="right-header">会话/);
  assert.match(html, /class="composer-box"/);
  assert.match(html, /class="tool-row"/);
  assert.match(html, />Activity</);
  assert.doesNotMatch(html, /class="top-bar"/);
  assert.doesNotMatch(html, /tool-card/);
  assert.doesNotMatch(html, /todo|Todos/i);
  assert.match(css, /grid-template-areas: "sidebar main right" "sidebar footer right"/);
  assert.match(css, /height: 36px/);
  assert.match(css, /border-right: 1px solid var\(--line\)/);
  assert.match(css, /--font-sans:/);
  assert.doesNotMatch(css, /Microsoft YaHei|微软雅黑/i);
  assert.doesNotMatch(css, /todo/i);
  assert.match(css, /max-width: 920px/);
  assert.match(css, /data-left-open="true"/);
  assert.match(js, /data-toggle-left/);
  assert.equal(resolveStaticPath(root, "/..%2fpackage.json"), null);
  assert.ok(resolveStaticPath(root, "/")?.endsWith(join("static", "index.html")));
  console.log("  PASS");
}
