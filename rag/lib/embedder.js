const fs = require('node:fs/promises');

const DEFAULT_MODEL = 'Xenova/multilingual-e5-small';
const DEFAULT_DTYPE = 'q8';

class LocalE5Embedder {
  constructor(options = {}) {
    this.model = options.model || DEFAULT_MODEL;
    this.dtype = options.dtype || DEFAULT_DTYPE;
    this.cacheDir = options.cacheDir;
    this.extractor = null;
  }

  async initialize() {
    if (this.extractor) {
      return;
    }

    if (this.cacheDir) {
      await fs.mkdir(this.cacheDir, { recursive: true });
    }

    const { env, pipeline } = await import('@huggingface/transformers');
    if (this.cacheDir) {
      env.cacheDir = this.cacheDir;
    }

    this.extractor = await pipeline('feature-extraction', this.model, {
      dtype: this.dtype
    });
  }

  async embedDocuments(texts) {
    return this.#embed(texts, 'passage: ');
  }

  async embedQuery(text) {
    const [embedding] = await this.#embed([text], 'query: ');
    return embedding;
  }

  async #embed(texts, prefix) {
    await this.initialize();
    const values = texts.map((text) => `${prefix}${String(text || '').trim()}`);
    const output = await this.extractor(values, {
      pooling: 'mean',
      normalize: true
    });
    return output.tolist();
  }
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_DTYPE,
  LocalE5Embedder
};
