import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runCodeSearchSmoke({ setupTmp, cleanup }) {
  console.log("--- smoke: code search ---");
  const root = setupTmp();
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "test"), { recursive: true });
    writeFileSync(join(root, "src", "auth-service.mjs"), [
      "export function issueSessionToken(user) {",
      "  const token = signJwt({ subject: user.id });",
      "  return { token, expiresIn: 3600 };",
      "}",
      "",
      "function signJwt(payload) {",
      "  return JSON.stringify(payload);",
      "}",
    ].join("\n"));
    writeFileSync(join(root, "src", "token_issuer.py"), [
      "class TokenIssuer:",
      "    def issue_token(self, user):",
      "        return sign_jwt({\"subject\": user.id})",
    ].join("\n"));
    writeFileSync(join(root, "test", "auth-service.test.mjs"), "assert.equal(issueSessionToken(user).token, expectedToken);\n");

    const { searchCode } = await import("../src/agent/code-search/engine.mjs");
    const { CodeSearchIndexCache } = await import("../src/agent/code-search/cache.mjs");
    const { Model2VecVectorizer } = await import("../src/agent/code-search/retrieval/model2vec.mjs");
    const { ResilientVectorizer } = await import("../src/agent/code-search/retrieval/resilient-vectorizer.mjs");
    const cache = new CodeSearchIndexCache();
    const result = await searchCode({ root, query: "issueSessionToken", top_k: 3, cache });
    assert.ok(result.stats.files >= 1);
    assert.ok(result.stats.chunks >= 1);
    assert.equal(result.results[0].file_path, "src/auth-service.mjs");
    assert.equal(result.results[0].kind, "function");
    assert.match(result.results[0].snippet, /issueSessionToken/);
    assert.equal(result.stats.mode, "hybrid");

    const semantic = await searchCode({ root, query: "jwt payload serialization", top_k: 1, mode: "semantic", cache });
    assert.equal(semantic.stats.mode, "semantic");
    assert.equal(semantic.results[0].file_path, "src/auth-service.mjs");

    const python = await searchCode({ root, query: "token issuer class", top_k: 1, mode: "symbol", cache });
    assert.equal(python.results[0].file_path, "src/token_issuer.py");
    assert.equal(python.results[0].kind, "class");
    assert.deepEqual(python.results[0].symbols, ["TokenIssuer"]);

    assert.ok(result.stats.indexed_files >= 1);
    assert.equal(result.stats.reused_index, false);

    const repeated = await searchCode({ root, query: "sign jwt payload", top_k: 1, cache });
    assert.equal(repeated.results[0].file_path, "src/auth-service.mjs");
    assert.ok(repeated.stats.reused_files >= 1);
    assert.equal(repeated.stats.indexed_files, 0);
    assert.equal(repeated.stats.reused_index, true);

    const storagePath = join(root, "node_modules", ".cache", "code-search", "chunks.json");
    const persistentCache = new CodeSearchIndexCache({ storagePath });
    await searchCode({ root, query: "issue session token", top_k: 1, cache: persistentCache });
    assert.equal(existsSync(storagePath), true);

    const restoredCache = new CodeSearchIndexCache({ storagePath });
    const restored = await searchCode({ root, query: "issue session token", top_k: 1, cache: restoredCache });
    assert.equal(restored.stats.indexed_files, 0);
    assert.ok(restored.stats.reused_files >= 1);

    const modelDir = join(root, "model2vec-fixture");
    writeTinyModel2Vec(modelDir);
    const model2vecCache = new CodeSearchIndexCache({
      vectorizer: new Model2VecVectorizer({ modelDir, allowDownload: false }),
    });
    const model2vec = await searchCode({ root, query: "jwt payload", top_k: 1, mode: "semantic", cache: model2vecCache });
    assert.equal(model2vec.stats.mode, "semantic");
    assert.equal(model2vec.results[0].file_path, "src/auth-service.mjs");

    const fallbackCache = new CodeSearchIndexCache({
      vectorizer: new ResilientVectorizer({ primary: new FailingVectorizer(), label: "code_search" }),
    });
    const fallback = await searchCode({ root, query: "issueSessionToken", top_k: 1, mode: "semantic", cache: fallbackCache });
    assert.equal(fallback.stats.vectorizer_status, "fallback");
    assert.match(fallback.stats.vectorizer_warning, /using local hashing fallback/);
    assert.equal(fallback.results[0].file_path, "src/auth-service.mjs");

    const fileScoped = await searchCode({ root, path: "src/auth-service.mjs", query: "sign jwt payload", top_k: 1, cache });
    assert.equal(fileScoped.results[0].file_path, "src/auth-service.mjs");

    const related = await searchCode({
      root,
      path: "src/auth-service.mjs",
      query: "signJwt payload",
      related_to: { file_path: "src/auth-service.mjs", line: 1 },
      top_k: 1,
      cache,
    });
    assert.equal(related.stats.mode, "related");
    assert.equal(related.results[0].file_path, "src/auth-service.mjs");
    assert.match(related.results[0].snippet, /signJwt/);

    await assert.rejects(() => searchCode({ root, path: "..", query: "outside" }), /escapes workspace/);

    const { executeCodeSearch } = await import("../src/agent/code-search/tool.mjs");
    const toolResult = await executeCodeSearch({
      engine: { cwd: root, resolvePath: (path) => join(root, path) },
      query: "sign jwt payload",
      top_k: 1,
    });
    assert.match(toolResult.content[0].text, /code_search/);
    assert.equal(toolResult.details.results.length, 1);
  } finally {
    cleanup(root);
  }
  console.log("  PASS");
}

class FailingVectorizer {
  constructor() {
    this.id = "failing-vectorizer";
    this.dimensions = 256;
  }

  async encode() {
    throw new Error("fixture download failed");
  }
}

function writeTinyModel2Vec(modelDir) {
  mkdirSync(modelDir, { recursive: true });
  writeFileSync(join(modelDir, "config.json"), JSON.stringify({ normalize: true, embedding_dtype: "float32" }));
  writeFileSync(join(modelDir, "tokenizer.json"), JSON.stringify({
    normalizer: { lowercase: true },
    model: {
      type: "WordPiece",
      unk_token: "[UNK]",
      continuing_subword_prefix: "##",
      max_input_chars_per_word: 100,
      vocab: {
        "[PAD]": 0,
        "[UNK]": 1,
        jwt: 2,
        payload: 3,
        sign: 4,
        subject: 5,
        token: 6,
        issuer: 7,
        class: 8,
        session: 9,
      },
    },
  }));
  writeFileSync(join(modelDir, "model.safetensors"), tinySafetensors({
    embeddings: {
      shape: [10, 4],
      values: new Float32Array([
        0, 0, 0, 0,
        0, 0, 0, 0,
        1, 0, 0, 0,
        1, 0, 0, 0,
        0.8, 0, 0, 0,
        0.6, 0, 0, 0,
        0.2, 1, 0, 0,
        0, 1, 0, 0,
        0, 1, 0, 0,
        0.2, 1, 0, 0,
      ]),
    },
  }));
}

function tinySafetensors(tensors) {
  let offset = 0;
  const header = {};
  const buffers = [];
  for (const [name, tensor] of Object.entries(tensors)) {
    const bytes = Buffer.from(tensor.values.buffer, tensor.values.byteOffset, tensor.values.byteLength);
    header[name] = { dtype: "F32", shape: tensor.shape, data_offsets: [offset, offset + bytes.length] };
    buffers.push(bytes);
    offset += bytes.length;
  }
  let headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const paddedLength = Math.ceil(headerBytes.length / 8) * 8;
  headerBytes = Buffer.concat([headerBytes, Buffer.alloc(paddedLength - headerBytes.length, 0x20)]);
  const prefix = Buffer.alloc(8);
  prefix.writeBigUInt64LE(BigInt(headerBytes.length));
  return Buffer.concat([prefix, headerBytes, ...buffers]);
}
