const { semanticRelations } = require('./knowledge-graph');
const { cosineSimilarity, lexicalMatchScore } = require('./ranking');

const MIN_CONTEXT_CHARS_PER_DIRECT_SEED = 160;

function clamp(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function roundScore(value) {
  return Math.round(Number(value || 0) * 1_000_000) / 1_000_000;
}

function publicArticle(value) {
  return {
    postId: value.postId || value.post_id,
    slug: value.slug,
    title: value.title || value.slug,
    url: `/posts/${value.slug}`,
    category: value.category || '',
    tags: Array.isArray(value.tags) ? value.tags : [],
    excerpt: value.excerpt || ''
  };
}

function buildArticleSelection(profiles, seeds, neighborsPerSeed) {
  const selected = new Map();
  const profilesByPostId = new Map(profiles.map((profile) => [profile.postId, profile]));

  for (const seed of seeds) {
    const profile = profilesByPostId.get(seed.post_id);
    if (!profile) {
      continue;
    }

    selected.set(profile.postId, {
      ...publicArticle(profile),
      origin: 'direct',
      seedScore: roundScore(seed.score),
      seedRelevanceScore: roundScore(seed.relevanceScore),
      via: []
    });
  }

  if (neighborsPerSeed <= 0) {
    return selected;
  }

  for (const seed of seeds) {
    const relations = semanticRelations(profiles, seed.slug, neighborsPerSeed);
    if (!relations) {
      continue;
    }

    for (const relation of relations.related) {
      const profile = profilesByPostId.get(relation.postId);
      if (!profile) {
        continue;
      }

      const existing = selected.get(profile.postId);
      if (existing?.origin === 'direct') {
        continue;
      }

      const path = {
        sourceSlug: seed.slug,
        sourceTitle: seed.title || seed.slug,
        similarity: roundScore(relation.similarity),
        semanticLift: roundScore(relation.semanticLift),
        relationScore: roundScore(relation.relationScore),
        sharedTags: relation.sharedTags || [],
        sameCategory: Boolean(relation.sameCategory)
      };

      if (!existing) {
        selected.set(profile.postId, {
          ...publicArticle(profile),
          origin: 'graph',
          graphScore: path.relationScore,
          via: [path]
        });
        continue;
      }

      existing.via.push(path);
      existing.via.sort((left, right) => right.relationScore - left.relationScore);
      existing.graphScore = Math.max(existing.graphScore || 0, path.relationScore);
    }
  }

  return selected;
}

function scoreChunk(chunk, article, queryEmbedding, query) {
  const semanticScore = cosineSimilarity(queryEmbedding, chunk.embedding);
  const lexicalScore = lexicalMatchScore(query, chunk);
  const directBoost = article.origin === 'direct' ? 0.06 : 0;
  const graphBoost = article.origin === 'graph'
    ? Math.min(0.08, Math.max(0, Number(article.graphScore || 0) * 0.06))
    : 0;
  const retrievalScore = semanticScore + (lexicalScore * 0.12) + directBoost + graphBoost;

  return {
    chunk,
    article,
    semanticScore,
    lexicalScore,
    retrievalScore
  };
}

function topChunksForArticle(chunks, article, queryEmbedding, query, limit) {
  return chunks
    .filter((chunk) => chunk.post_id === article.postId)
    .map((chunk) => scoreChunk(chunk, article, queryEmbedding, query))
    .sort((left, right) => right.retrievalScore - left.retrievalScore)
    .slice(0, limit);
}

function contextCandidateKey(candidate) {
  return candidate.chunk.chunk_id;
}

function chooseContextCandidates(chunks, selectedArticles, queryEmbedding, query, maxChunks) {
  const required = [];
  const optional = [];

  for (const article of selectedArticles.values()) {
    const perArticleLimit = article.origin === 'direct' ? 2 : 1;
    const ranked = topChunksForArticle(
      chunks,
      article,
      queryEmbedding,
      query,
      perArticleLimit
    );

    if (ranked.length === 0) {
      continue;
    }

    if (article.origin === 'direct') {
      required.push({ ...ranked[0], required: true });
      optional.push(...ranked.slice(1).map((candidate) => ({ ...candidate, required: false })));
    } else {
      optional.push(...ranked.map((candidate) => ({ ...candidate, required: false })));
    }
  }

  required.sort((left, right) => right.retrievalScore - left.retrievalScore);
  optional.sort((left, right) => right.retrievalScore - left.retrievalScore);

  const chosen = [];
  const seen = new Set();
  for (const candidate of [...required, ...optional]) {
    const key = contextCandidateKey(candidate);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    chosen.push(candidate);
    if (chosen.length >= maxChunks) {
      break;
    }
  }

  return chosen;
}

function fitContent(value, availableChars) {
  const normalized = String(value || '').trim();
  if (normalized.length <= availableChars) {
    return normalized;
  }
  if (availableChars <= 1) {
    return '';
  }
  return `${normalized.slice(0, availableChars - 1).trimEnd()}…`;
}

function materializeContext(candidates, maxChars) {
  const context = [];
  let usedChars = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const remainingRequiredSeeds = candidates
      .slice(index + 1)
      .filter((entry) => entry.required)
      .length;
    const reservedForDirectSeeds = remainingRequiredSeeds * MIN_CONTEXT_CHARS_PER_DIRECT_SEED;
    const available = maxChars - usedChars - reservedForDirectSeeds;

    if (available < MIN_CONTEXT_CHARS_PER_DIRECT_SEED) {
      if (candidate.required) {
        continue;
      }
      break;
    }

    const content = fitContent(candidate.chunk.content, available);
    if (!content) {
      continue;
    }

    const citation = `K${context.length + 1}`;
    context.push({
      citation,
      title: candidate.article.title,
      slug: candidate.article.slug,
      url: candidate.article.url,
      heading: candidate.chunk.heading || '',
      ordinal: Number(candidate.chunk.ordinal) || 0,
      content,
      origin: candidate.article.origin,
      semanticScore: roundScore(candidate.semanticScore),
      lexicalScore: roundScore(candidate.lexicalScore),
      retrievalScore: roundScore(candidate.retrievalScore),
      via: candidate.article.origin === 'graph' ? candidate.article.via : []
    });
    usedChars += content.length;
  }

  return { context, usedChars };
}

function buildPromptContext(context) {
  return context.map((entry) => {
    const heading = entry.heading ? ` — ${entry.heading}` : '';
    const provenance = entry.origin === 'graph' && entry.via?.[0]
      ? `Graph-Nachbar via ${entry.via[0].sourceTitle}`
      : 'Direkter semantischer Treffer';
    return `[${entry.citation}] ${entry.title}${heading}\nURL: ${entry.url}\nHerkunft: ${provenance}\n${entry.content}`;
  }).join('\n\n');
}

function buildSources(context) {
  const sources = new Map();
  for (const entry of context) {
    let source = sources.get(entry.slug);
    if (!source) {
      source = {
        slug: entry.slug,
        title: entry.title,
        url: entry.url,
        citations: []
      };
      sources.set(entry.slug, source);
    }
    source.citations.push(entry.citation);
  }
  return [...sources.values()];
}

function emptyRetrieval(limits) {
  return {
    strategy: 'semantic-search+1-hop-knowledge-graph',
    seeds: [],
    expandedArticles: [],
    context: [],
    sources: [],
    promptContext: '',
    contextCharacters: 0,
    limits
  };
}

function retrieveGraphContext({
  chunks,
  profiles,
  query,
  queryEmbedding,
  seeds,
  neighborsPerSeed = 2,
  maxChunks = 8,
  maxChars = 12_000
}) {
  const safeNeighbors = clamp(neighborsPerSeed, 2, 0, 4);
  const requestedMaxChunks = clamp(maxChunks, 8, 1, 12);
  const safeMaxChars = clamp(maxChars, 12_000, 2_000, 24_000);
  const safeSeeds = Array.isArray(seeds) ? seeds : [];

  if (safeSeeds.length === 0) {
    return emptyRetrieval({
      neighborsPerSeed: safeNeighbors,
      maxChunks: requestedMaxChunks,
      maxChars: safeMaxChars
    });
  }

  const selectedArticles = buildArticleSelection(
    Array.isArray(profiles) ? profiles : [],
    safeSeeds,
    safeNeighbors
  );
  const directArticleCount = [...selectedArticles.values()]
    .filter((article) => article.origin === 'direct')
    .length;
  const effectiveMaxChunks = Math.min(12, Math.max(requestedMaxChunks, directArticleCount));
  const candidates = chooseContextCandidates(
    Array.isArray(chunks) ? chunks : [],
    selectedArticles,
    queryEmbedding,
    query,
    effectiveMaxChunks
  );
  const materialized = materializeContext(candidates, safeMaxChars);

  return {
    strategy: 'semantic-search+1-hop-knowledge-graph',
    seeds: safeSeeds.map((seed) => ({
      ...publicArticle(seed),
      score: roundScore(seed.score),
      relevanceScore: roundScore(seed.relevanceScore)
    })),
    expandedArticles: [...selectedArticles.values()]
      .filter((article) => article.origin === 'graph')
      .sort((left, right) => (right.graphScore || 0) - (left.graphScore || 0)),
    context: materialized.context,
    sources: buildSources(materialized.context),
    promptContext: buildPromptContext(materialized.context),
    contextCharacters: materialized.usedChars,
    limits: {
      neighborsPerSeed: safeNeighbors,
      maxChunks: effectiveMaxChunks,
      maxChars: safeMaxChars
    }
  };
}

module.exports = {
  buildArticleSelection,
  buildPromptContext,
  buildSources,
  chooseContextCandidates,
  retrieveGraphContext
};
