const { DEFAULT_DTYPE, DEFAULT_MODEL, LocalE5Embedder } = require('./embedder');
const { HASH_MODEL, HashEmbedder } = require('./hash-embedder');

function createEmbedder(options = {}) {
  const mode = String(options.mode || process.env.RAG_EMBEDDER_MODE || 'e5').trim().toLowerCase();

  if (mode === 'hash') {
    return {
      embedder: new HashEmbedder(),
      embeddingModel: HASH_MODEL,
      mode
    };
  }

  if (mode !== 'e5') {
    throw new Error(`Unsupported RAG_EMBEDDER_MODE: ${mode}`);
  }

  const model = options.model || process.env.RAG_MODEL || DEFAULT_MODEL;
  const dtype = options.dtype || process.env.RAG_DTYPE || DEFAULT_DTYPE;
  return {
    embedder: new LocalE5Embedder({
      model,
      dtype,
      cacheDir: options.cacheDir
    }),
    embeddingModel: model,
    mode
  };
}

module.exports = {
  createEmbedder
};
