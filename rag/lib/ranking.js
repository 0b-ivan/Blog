function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || left.length === 0) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    const a = Number(left[index]);
    const b = Number(right[index]);
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function rankChunks(chunks, queryEmbedding, limit = 8) {
  const bestByPost = new Map();

  for (const chunk of chunks) {
    const score = cosineSimilarity(queryEmbedding, chunk.embedding);
    const existing = bestByPost.get(chunk.post_id);
    if (!existing || score > existing.score) {
      bestByPost.set(chunk.post_id, { ...chunk, score });
    }
  }

  return [...bestByPost.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

module.exports = {
  cosineSimilarity,
  rankChunks
};
