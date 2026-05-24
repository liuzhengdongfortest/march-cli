import { chunkFile } from "./chunker.mjs";
import { Bm25Index } from "./retrieval/bm25.mjs";
import { LocalVectorIndex } from "./retrieval/vector.mjs";

const DEFAULT_MAX_FILE_ENTRIES = 8_000;
const DEFAULT_MAX_INDEX_ENTRIES = 24;

export class CodeSearchIndexCache {
  constructor({ maxFileEntries = DEFAULT_MAX_FILE_ENTRIES, maxIndexEntries = DEFAULT_MAX_INDEX_ENTRIES } = {}) {
    this.maxFileEntries = maxFileEntries;
    this.maxIndexEntries = maxIndexEntries;
    this.fileChunks = new Map();
    this.indices = new Map();
  }

  async build(files) {
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
      chunks.push(...fileChunks);
      indexedFiles += 1;
    }

    this.pruneFileCache();

    const indexSignature = files.map(fileSignature).join("\n");
    const cachedIndex = this.indices.get(indexSignature);
    if (cachedIndex) {
      this.indices.delete(indexSignature);
      this.indices.set(indexSignature, cachedIndex);
      return { chunks, index: cachedIndex, reusedFiles, indexedFiles, reusedIndex: true };
    }

    const index = {
      lexical: new Bm25Index(chunks),
      vector: new LocalVectorIndex(chunks),
    };
    this.indices.set(indexSignature, index);
    this.pruneIndexCache();
    return { chunks, index, reusedFiles, indexedFiles, reusedIndex: false };
  }

  clear() {
    this.fileChunks.clear();
    this.indices.clear();
  }

  pruneFileCache() {
    while (this.fileChunks.size > this.maxFileEntries) {
      const oldestKey = this.fileChunks.keys().next().value;
      this.fileChunks.delete(oldestKey);
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
