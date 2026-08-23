const { cosineSimilarity, median } = require('./ranking');

function normalized(value) {
  return String(value || '').trim().toLocaleLowerCase('de-DE');
}

function normalizeTags(tags) {
  return Array.isArray(tags)
    ? tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];
}

function averageEmbedding(vectors) {
  const usable = (Array.isArray(vectors) ? vectors : [])
    .filter((vector) => Array.isArray(vector) && vector.length > 0);

  if (usable.length === 0) {
    return [];
  }

  const dimensions = usable[0].length;
  const sameShape = usable.filter((vector) => vector.length === dimensions);
  if (sameShape.length === 0) {
    return [];
  }

  const sum = new Array(dimensions).fill(0);
  for (const vector of sameShape) {
    for (let index = 0; index < dimensions; index += 1) {
      sum[index] += Number(vector[index]) || 0;
    }
  }

  const mean = sum.map((value) => value / sameShape.length);
  const norm = Math.sqrt(mean.reduce((total, value) => total + (value * value), 0));
  return norm > 0 ? mean.map((value) => value / norm) : mean;
}

function buildPostProfiles(chunks) {
  const grouped = new Map();

  for (const chunk of Array.isArray(chunks) ? chunks : []) {
    if (!chunk?.post_id || !chunk?.slug) {
      continue;
    }

    let profile = grouped.get(chunk.post_id);
    if (!profile) {
      profile = {
        postId: chunk.post_id,
        slug: chunk.slug,
        title: chunk.title || chunk.slug,
        category: chunk.category || '',
        tags: normalizeTags(chunk.tags),
        excerpt: chunk.excerpt || '',
        vectors: []
      };
      grouped.set(chunk.post_id, profile);
    }

    if (Array.isArray(chunk.embedding) && chunk.embedding.length > 0) {
      profile.vectors.push(chunk.embedding);
    }
  }

  return [...grouped.values()]
    .map((profile) => ({
      postId: profile.postId,
      slug: profile.slug,
      title: profile.title,
      category: profile.category,
      tags: profile.tags,
      excerpt: profile.excerpt,
      embedding: averageEmbedding(profile.vectors)
    }))
    .filter((profile) => profile.embedding.length > 0);
}

function resolveProfile(profiles, requestedSlug) {
  const slug = normalized(requestedSlug);
  if (!slug) {
    return null;
  }

  const exact = profiles.find((profile) => normalized(profile.slug) === slug);
  if (exact) {
    return exact;
  }

  return profiles.find((profile) => normalized(profile.slug).endsWith(`-${slug}`)) || null;
}

function sharedTags(leftTags, rightTags) {
  const right = new Map(normalizeTags(rightTags).map((tag) => [normalized(tag), tag]));
  return normalizeTags(leftTags)
    .filter((tag) => right.has(normalized(tag)));
}

function publicProfile(profile) {
  return {
    postId: profile.postId,
    slug: profile.slug,
    title: profile.title,
    url: `/posts/${profile.slug}`,
    category: profile.category,
    tags: profile.tags,
    excerpt: profile.excerpt
  };
}

function roundScore(value) {
  return Math.round(Number(value || 0) * 1_000_000) / 1_000_000;
}

function semanticRelations(profiles, requestedSlug, limit = 8) {
  const source = resolveProfile(profiles, requestedSlug);
  if (!source) {
    return null;
  }

  const candidates = profiles
    .filter((profile) => profile.postId !== source.postId)
    .map((profile) => {
      const similarity = cosineSimilarity(source.embedding, profile.embedding);
      const tags = sharedTags(source.tags, profile.tags);
      const sameCategory = Boolean(
        normalized(source.category)
        && normalized(source.category) === normalized(profile.category)
      );
      const metadataBoost = Math.min(0.08, tags.length * 0.025) + (sameCategory ? 0.02 : 0);

      return {
        profile,
        similarity,
        sharedTags: tags,
        sameCategory,
        metadataBoost
      };
    });

  const baseline = median(candidates.map((candidate) => candidate.similarity));
  const safeLimit = Math.min(12, Math.max(1, Number(limit) || 8));

  const related = candidates
    .map((candidate) => {
      const semanticLift = candidate.similarity - baseline;
      const relationScore = candidate.similarity + candidate.metadataBoost + Math.max(0, semanticLift);
      return {
        ...candidate,
        semanticLift,
        relationScore
      };
    })
    .filter((candidate) => (
      candidate.similarity > 0
      || candidate.sharedTags.length > 0
      || candidate.sameCategory
    ))
    .sort((left, right) => {
      if (right.relationScore !== left.relationScore) {
        return right.relationScore - left.relationScore;
      }
      return String(left.profile.title).localeCompare(String(right.profile.title), 'de');
    })
    .slice(0, safeLimit)
    .map((candidate) => ({
      ...publicProfile(candidate.profile),
      similarity: roundScore(candidate.similarity),
      semanticLift: roundScore(candidate.semanticLift),
      relationScore: roundScore(candidate.relationScore),
      sharedTags: candidate.sharedTags,
      sameCategory: candidate.sameCategory
    }));

  return {
    source: publicProfile(source),
    semanticBaseline: roundScore(baseline),
    related
  };
}

function globalSemanticRelations(profiles, neighborsPerArticle = 4) {
  const safeProfiles = Array.isArray(profiles) ? profiles : [];
  const safeLimit = Math.min(8, Math.max(1, Number(neighborsPerArticle) || 4));
  const edges = new Map();

  for (const profile of safeProfiles) {
    const relations = semanticRelations(safeProfiles, profile.slug, safeLimit);
    if (!relations) {
      continue;
    }

    for (const related of relations.related) {
      const slugs = [profile.slug, related.slug].sort();
      const key = slugs.join('::');
      const candidate = {
        source: slugs[0],
        target: slugs[1],
        similarity: related.similarity,
        semanticLift: related.semanticLift,
        relationScore: related.relationScore,
        sharedTags: related.sharedTags,
        sameCategory: related.sameCategory
      };
      const existing = edges.get(key);
      if (!existing || candidate.relationScore > existing.relationScore) {
        edges.set(key, candidate);
      }
    }
  }

  return {
    articles: safeProfiles.map(publicProfile),
    edges: [...edges.values()].sort((left, right) => right.relationScore - left.relationScore)
  };
}

module.exports = {
  averageEmbedding,
  buildPostProfiles,
  globalSemanticRelations,
  resolveProfile,
  semanticRelations,
  sharedTags
};
