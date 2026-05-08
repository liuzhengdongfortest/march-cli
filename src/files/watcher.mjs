import { watch, readFileSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { homedir } from "node:os";

export class FileWatcher {
  constructor(cwd) {
    this.cwd = cwd;
    this.files = new Map();
    this.callbacks = new Set();
  }

  resolve(rawPath) {
    if (rawPath.startsWith("~/")) {
      return resolve(homedir(), rawPath.slice(2));
    }
    return resolve(this.cwd, rawPath);
  }

  displayPath(absolutePath) {
    const home = homedir();
    if (absolutePath.startsWith(home)) {
      return "~/" + relative(home, absolutePath);
    }
    return relative(this.cwd, absolutePath);
  }

  open(absolutePath) {
    if (this.files.has(absolutePath)) return this.files.get(absolutePath).content;
    if (!existsSync(absolutePath)) throw new Error(`File not found: ${absolutePath}`);

    const content = readFileSync(absolutePath, "utf-8");
    let watcher;
    try {
      watcher = watch(absolutePath, { persistent: false }, (eventType) => {
        if (eventType === "change") {
          try {
            const entry = this.files.get(absolutePath);
            if (entry) {
              entry.content = readFileSync(absolutePath, "utf-8");
              for (const cb of this.callbacks) cb(absolutePath);
            }
          } catch { /* file may have been deleted */ }
        }
      });
    } catch {
      // fs.watch may not support watching individual files on all platforms
      // Fall back: content is frozen at open time
      watcher = { close() {} };
    }

    const entry = { content, watcher };
    this.files.set(absolutePath, entry);
    return content;
  }

  close(absolutePath) {
    const entry = this.files.get(absolutePath);
    if (entry) {
      entry.watcher.close();
      this.files.delete(absolutePath);
    }
  }

  onChange(callback) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  getContent(absolutePath) {
    return this.files.get(absolutePath)?.content;
  }

  getFiles() {
    return [...this.files.keys()];
  }

  getEntries() {
    const entries = [];
    for (const [path, entry] of this.files) {
      entries.push({ path, displayPath: this.displayPath(path), content: entry.content });
    }
    return entries;
  }

  dispose() {
    for (const [, entry] of this.files) {
      entry.watcher.close();
    }
    this.files.clear();
    this.callbacks.clear();
  }
}
