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
    const sign = (digest[2] & 1) === 0 ? 1 : -1;
    vector[index] += sign;
  }

  return normalize(vector);
}

class HashEmbedder {
  async embedDocuments(texts) {
    return texts.map((text) => embedText(`passage: ${text}`));
  }

  async embedQuery(text) {
    return embedText(`query: ${text}`);
  }
}

module.exports = {
  HASH_MODEL,
  HashEmbedder,
  embedText
};
