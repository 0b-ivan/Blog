const STOP_WORDS = new Set([
  'aber', 'alle', 'allem', 'allen', 'aller', 'alles', 'als', 'also', 'am', 'an', 'andere', 'anderen', 'anderer', 'anderes',
  'auch', 'auf', 'aus', 'bei', 'bin', 'bis', 'da', 'dann', 'das', 'dass', 'dein', 'deine', 'deinen', 'deinem', 'deiner',
  'deines', 'dem', 'den', 'der', 'des', 'die', 'du', 'ein', 'eine', 'einem', 'einen', 'einer', 'eines', 'er', 'es', 'etwas',
  'euch', 'für', 'habe', 'haben', 'hat', 'hatte', 'ich', 'ihr', 'ihre', 'ihren', 'ihrem', 'ihrer', 'ihres', 'ihnen', 'im',
  'in', 'ist', 'kann', 'können', 'koennen', 'könnte', 'koennte', 'mein', 'meine', 'meinen', 'meinem', 'meiner', 'meines',
  'mich', 'mir', 'mit', 'möchte', 'moechte', 'muss', 'müssen', 'muessen', 'nach', 'nicht', 'oder', 'ohne', 'sein', 'seine',
  'seinen', 'seinem', 'seiner', 'seines', 'sie', 'sind', 'so', 'soll', 'sollen', 'sollte', 'über', 'ueber', 'und', 'uns',
  'unser', 'unsere', 'unseren', 'unserem', 'unserer', 'unseres', 'vom', 'von', 'vor', 'was', 'welche', 'welcher', 'welches',
  'welchem', 'welchen', 'wenn', 'werden', 'wie', 'wir', 'wird', 'zu', 'zum', 'zur'
]);

const DEFAULT_RELEVANCE = Object.freeze({
  minSemanticScore: 0.84,
  minSemanticLift: 0.025,
  minLexicalScore: 0.22,
  minLexicalSemanticScore: 0.80,
  lexicalBoost: 0.12
});

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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('de-DE');
}

function tokens(value, { removeStopWords = false } = {}) {
  const result = normalizeText(value).match(/[\p{L}\p{N}][\p{L}\p{N}+#._-]*/gu) || [];
  return result.filter((token) => token.length >= 2 && (!removeStopWords || !STOP_WORDS.has(token)));
}

function tokenMatches(queryToken, candidateToken) {
  if (queryToken === candidateToken) {
    return true;
  }

  if (queryToken.length < 3 || candidateToken.length < 3) {
    return false;
  }

  return candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken);
}

function lexicalMatchScore(query, chunk) {
  const queryTokens = tokens(query, { removeStopWords: true });
  if (queryTokens.length === 0) {
    return 0;
  }

  const bestPerToken = new Map(queryTokens.map((token) => [token, 0]));
  const fields = [
    [chunk.title, 1],
    [chunk.tags, 0.9],
    [chunk.heading, 0.75],
    [chunk.category, 0.65],
    [chunk.excerpt, 0.55],
    [chunk.content, 0.4]
  ];

  for (const [value, weight] of fields) {
    if (!value) {
      continue;
    }
    const candidateTokens = tokens(Array.isArray(value) ? value.join(' ') : value);
    for (const queryToken of queryTokens) {
      if (candidateTokens.some((candidateToken) => tokenMatches(queryToken, candidateToken))) {
        bestPerToken.set(queryToken, Math.max(bestPerToken.get(queryToken) || 0, weight));
      }
    }
  }

  return [...bestPerToken.values()].reduce((sum, value) => sum + value, 0) / queryTokens.length;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function rankChunks(chunks, queryEmbedding, query, limit = 8, relevanceOptions = {}) {
  const options = { ...DEFAULT_RELEVANCE, ...relevanceOptions };
  const bestByPost = new Map();

  for (const chunk of chunks) {
    const semanticScore = cosineSimilarity(queryEmbedding, chunk.embedding);
    const lexicalScore = lexicalMatchScore(query, chunk);
    const chunkRankScore = semanticScore + (lexicalScore * options.lexicalBoost);
    const existing = bestByPost.get(chunk.post_id);
    if (!existing || chunkRankScore > existing.chunkRankScore) {
      bestByPost.set(chunk.post_id, {
        ...chunk,
        semanticScore,
        lexicalScore,
        chunkRankScore
      });
    }
  }

  const candidates = [...bestByPost.values()];
  const semanticBaseline = median(candidates.map((candidate) => candidate.semanticScore));

  return candidates
    .map((candidate) => {
      const semanticLift = candidate.semanticScore - semanticBaseline;
      const lexicalQualified = candidate.lexicalScore >= options.minLexicalScore
        && candidate.semanticScore >= options.minLexicalSemanticScore;
      const semanticQualified = candidate.semanticScore >= options.minSemanticScore
        && semanticLift >= options.minSemanticLift;
      const relevanceScore = candidate.chunkRankScore + Math.max(0, semanticLift);

      return {
        ...candidate,
        score: candidate.semanticScore,
        semanticLift,
        relevanceScore,
        relevant: lexicalQualified || semanticQualified
      };
    })
    .filter((candidate) => candidate.relevant)
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, limit);
}

module.exports = {
  DEFAULT_RELEVANCE,
  cosineSimilarity,
  lexicalMatchScore,
  median,
  rankChunks,
  tokens
};
