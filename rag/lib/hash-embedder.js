const crypto = require('node:crypto');

const HASH_MODEL = 'kernel-notes/hash-embedding-v1';
const DIMENSIONS = 64;

function normalize(vector) {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));
  if (!length) {
    return vector;
  }
  return vector.map((value) => value / length);
}

function embedText(value) {
  const vector = Array(DIMENSIONS).fill(0);
  const tokens = String(value || '')
    .toLocaleLowerCase('de-DE')
    .match(/[\p{L}\p{N}_-]+/gu) || [];

  for (const token of tokens) {
    const digest = crypto.createHash('sha256').update(token).digest();
    const index = digest.readUInt16BE(0) % DIMENSIONS;
    vector[index] += 1;
  }

  return normalize(vector);
}

class HashEmbedder {
  async embedDocuments(texts) {
    return texts.map(embedText);
  }

  async embedQuery(text) {
    return embedText(text);
  }
}

module.exports = {
  HASH_MODEL,
  HashEmbedder,
  embedText
};
