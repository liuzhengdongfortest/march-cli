import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { readSafetensors } from "./safetensors.mjs";
import { normalizedVector } from "./vector.mjs";
import { WordPieceTokenizer } from "./wordpiece.mjs";

export const POTION_CODE_MODEL_ID = "minishlab/potion-code-16M";
const HF_RESOLVE_BASE = "https://huggingface.co";
const MODEL_FILES = ["config.json", "tokenizer.json", "model.safetensors"];

export class Model2VecVectorizer {
  constructor({ modelDir, modelId = POTION_CODE_MODEL_ID, allowDownload = true, onStatus = null } = {}) {
    if (!modelDir) throw new Error("Model2VecVectorizer requires modelDir");
    this.modelDir = modelDir;
    this.modelId = modelId;
    this.allowDownload = allowDownload;
    this.onStatus = onStatus;
    this.id = `model2vec:${modelId}`;
    this.dimensions = 256;
    this.modelPromise = null;
  }

  async encode(texts) {
    const model = await this.load();
    return texts.map((text) => model.encode(text));
  }

  async load({ onStatus = null } = {}) {
    if (onStatus) this.onStatus = onStatus;
    this.modelPromise ??= this.loadModel();
    return this.modelPromise;
  }

  async loadModel() {
    await ensureModelFiles({ modelDir: this.modelDir, modelId: this.modelId, allowDownload: this.allowDownload, onStatus: this.onStatus });
    const config = JSON.parse(await readFile(join(this.modelDir, "config.json"), "utf8"));
    const tokenizerJson = JSON.parse(await readFile(join(this.modelDir, "tokenizer.json"), "utf8"));
    const tensors = await readSafetensors(join(this.modelDir, "model.safetensors"));
    const embeddings = tensors.getTensor(tensors.names.includes("embeddings") ? "embeddings" : "embedding.weight");
    const weights = tensors.names.includes("weights") ? tensors.getTensor("weights") : null;
    const mapping = tensors.names.includes("mapping") ? tensors.getTensor("mapping") : null;
    const model = new LoadedModel2Vec({ config, tokenizerJson, embeddings, weights, mapping });
    this.dimensions = model.dimensions;
    return model;
  }
}

export async function ensureModelFiles({ modelDir, modelId = POTION_CODE_MODEL_ID, allowDownload = true, onStatus = null } = {}) {
  const missing = MODEL_FILES.filter((name) => !existsSync(join(modelDir, name)));
  if (missing.length === 0) return;
  if (!allowDownload) throw new Error(`Missing Model2Vec files in ${modelDir}: ${missing.join(", ")}`);
  await mkdir(modelDir, { recursive: true });
  onStatus?.({ phase: "start", modelId, totalFiles: missing.length });
  for (let index = 0; index < missing.length; index += 1) {
    const name = missing[index];
    await downloadModelFile({ modelDir, modelId, name, index, totalFiles: missing.length, onStatus });
  }
}

class LoadedModel2Vec {
  constructor({ config, tokenizerJson, embeddings, weights, mapping }) {
    this.normalize = config?.normalize !== false;
    this.tokenizer = new WordPieceTokenizer(tokenizerJson);
    this.embeddings = embeddings.values;
    this.vocabularySize = embeddings.shape[0];
    this.dimensions = embeddings.shape[1];
    this.weights = weights?.values ?? null;
    this.mapping = mapping?.values ?? null;
  }

  encode(text) {
    const ids = this.tokenizer.encode(text);
    const values = new Float32Array(this.dimensions);
    let count = 0;
    for (const id of ids) {
      const mapped = this.mapping ? this.mapping[id] : id;
      if (mapped == null || mapped < 0 || mapped >= this.vocabularySize) continue;
      const weight = this.weights?.[id] ?? 1;
      const offset = mapped * this.dimensions;
      for (let dim = 0; dim < this.dimensions; dim += 1) values[dim] += this.embeddings[offset + dim] * weight;
      count += 1;
    }
    if (count > 0) for (let dim = 0; dim < this.dimensions; dim += 1) values[dim] /= count;
    const vector = normalizedVector(values);
    if (this.normalize && vector.norm > 0) {
      for (let dim = 0; dim < values.length; dim += 1) values[dim] /= vector.norm;
      return normalizedVector(values);
    }
    return vector;
  }
}

async function downloadModelFile({ modelDir, modelId, name, index = 0, totalFiles = 1, onStatus = null }) {
  const url = `${HF_RESOLVE_BASE}/${modelId}/resolve/main/${name}`;
  onStatus?.({ phase: "downloading", modelId, file: name, fileIndex: index + 1, totalFiles });
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Failed to download ${modelId}/${name}: HTTP ${response.status}`);
  const bytes = await readResponseBytes(response, (progress) => {
    onStatus?.({ phase: "downloading", modelId, file: name, fileIndex: index + 1, totalFiles, ...progress });
  });
  const target = join(modelDir, name);
  const tmpPath = join(dirname(target), `${basename(target)}.${process.pid}.tmp`);
  await writeFile(tmpPath, bytes);
  await rename(tmpPath, target);
  onStatus?.({ phase: "downloaded", modelId, file: name, fileIndex: index + 1, totalFiles });
}

async function readResponseBytes(response, onProgress) {
  const totalBytes = Number(response.headers.get("content-length")) || null;
  if (!response.body?.getReader) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks = [];
  let loadedBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    onProgress({ loadedBytes, totalBytes, percent: totalBytes ? Math.floor((loadedBytes / totalBytes) * 100) : null });
  }
  const bytes = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
