import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chunkFile } from "./chunker.mjs";
import { Bm25Index } from "./retrieval/bm25.mjs";
import { describeVectorizer } from "./retrieval/resilient-vectorizer.mjs";
import { LocalVectorIndex, defaultVectorizer } from "./retrieval/vector.mjs";

const DEFAULT_MAX_FILE_ENTRIES = 8_000;
const DEFAULT_MAX_INDEX_ENTRIES = 24;

export class CodeSearchIndexCache {
  constructor({
    maxFileEntries = DEFAULT_MAX_FILE_ENTRIES,
    maxIndexEntries = DEFAULT_MAX_INDEX_ENTRIES,
    storagePath = null,
    vectorizer = defaultVectorizer,
  } = {}) {
    this.maxFileEntries = maxFileEntries;
    this.maxIndexEntries = maxIndexEntries;
    this.storagePath = storagePath;
    this.vectorizer = vectorizer;
    this.fileChunks = new Map();
    this.indices = new Map();
    this.loaded = false;
    this.dirty = false;
  }

  async build(files) {
    await this.load();
    const chunks = [];
    let reusedFiles = 0;
    let indexedFiles = 0;
    for (const file of files) {
      const signature = fileSignature(file);
      const key = fileCacheKey(file);
      const cached = this.fileChunks.get(key);
      if (cached?.signature === signature) {
        chunks.push(...cached.chunks);
        reusedFiles += 1;
        continue;
      }
      const fileChunks = await chunkFile(file);
      this.fileChunks.set(key, { signature, chunks: fileChunks });
      this.dirty = true;
      chunks.push(...fileChunks);
      indexedFiles += 1;
    }

    this.pruneFileCache();
    await this.persist();

    const indexSignature = [this.vectorizer.id, ...files.map(fileSignature)].join("\n");
    const cachedIndex = this.indices.get(indexSignature);
    if (cachedIndex) {
      this.indices.delete(indexSignature);
      this.indices.set(indexSignature, cachedIndex);
      return { chunks, index: cachedIndex, reusedFiles, indexedFiles, reusedIndex: true, ...describeVectorizer(this.vectorizer) };
    }

    const index = {
      lexical: new Bm25Index(chunks),
      vector: await LocalVectorIndex.create(chunks, { vectorizer: this.vectorizer }),
    };
    this.indices.set(indexSignature, index);
    this.pruneIndexCache();
    return { chunks, index, reusedFiles, indexedFiles, reusedIndex: false, ...describeVectorizer(this.vectorizer) };
  }

  clear() {
    this.fileChunks.clear();
    this.indices.clear();
    this.loaded = true;
    this.dirty = true;
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.storagePath) return;
    try {
      const raw = await readFile(this.storagePath, "utf8");
      const parsed = JSON.parse(raw);
      for (const entry of parsed.files ?? []) {
        if (!entry?.key || !entry.signature || !Array.isArray(entry.chunks)) continue;
        this.fileChunks.set(entry.key, { signature: entry.signature, chunks: entry.chunks });
      }
      this.pruneFileCache();
    } catch (err) {
      if (err?.code !== "ENOENT") this.fileChunks.clear();
    }
  }

  async persist() {
    if (!this.storagePath || !this.dirty) return;
    const payload = {
      version: 1,
      files: [...this.fileChunks.entries()].map(([key, value]) => ({
        key,
        signature: value.signature,
        chunks: value.chunks,
      })),
    };
    await mkdir(dirname(this.storagePath), { recursive: true });
    const tmpPath = `${this.storagePath}.${process.pid}.tmp`;
    await writeFile(tmpPath, JSON.stringify(payload), "utf8");
    await rename(tmpPath, this.storagePath);
    this.dirty = false;
  }

  pruneFileCache() {
    while (this.fileChunks.size > this.maxFileEntries) {
      const oldestKey = this.fileChunks.keys().next().value;
      this.fileChunks.delete(oldestKey);
      this.dirty = true;
    }
  }

  pruneIndexCache() {
    while (this.indices.size > this.maxIndexEntries) {
      const oldestKey = this.indices.keys().next().value;
      this.indices.delete(oldestKey);
    }
  }
}

export const defaultCodeSearchIndexCache = new CodeSearchIndexCache();

function fileSignature(file) {
  return `${fileCacheKey(file)}:${file.size ?? 0}:${Math.trunc(file.mtimeMs ?? 0)}`;
}

function fileCacheKey(file) {
  return file.absPath ?? file.relPath;
}
