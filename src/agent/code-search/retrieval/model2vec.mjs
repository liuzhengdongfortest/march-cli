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
  constructor({ modelDir, modelId = POTION_CODE_MODEL_ID, allowDownload = true } = {}) {
    if (!modelDir) throw new Error("Model2VecVectorizer requires modelDir");
    this.modelDir = modelDir;
    this.modelId = modelId;
    this.allowDownload = allowDownload;
    this.id = `model2vec:${modelId}`;
    this.dimensions = 256;
    this.modelPromise = null;
  }

  async encode(texts) {
    const model = await this.load();
    return texts.map((text) => model.encode(text));
  }

  async load() {
    this.modelPromise ??= this.loadModel();
    return this.modelPromise;
  }

  async loadModel() {
    await ensureModelFiles({ modelDir: this.modelDir, modelId: this.modelId, allowDownload: this.allowDownload });
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

export async function ensureModelFiles({ modelDir, modelId = POTION_CODE_MODEL_ID, allowDownload = true }) {
  const missing = MODEL_FILES.filter((name) => !existsSync(join(modelDir, name)));
  if (missing.length === 0) return;
  if (!allowDownload) throw new Error(`Missing Model2Vec files in ${modelDir}: ${missing.join(", ")}`);
  await mkdir(modelDir, { recursive: true });
  for (const name of missing) await downloadModelFile({ modelDir, modelId, name });
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

async function downloadModelFile({ modelDir, modelId, name }) {
  const url = `${HF_RESOLVE_BASE}/${modelId}/resolve/main/${name}`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Failed to download ${modelId}/${name}: HTTP ${response.status}`);
  const target = join(modelDir, name);
  const tmpPath = join(dirname(target), `${basename(target)}.${process.pid}.tmp`);
  await writeFile(tmpPath, new Uint8Array(await response.arrayBuffer()));
  await rename(tmpPath, target);
}
