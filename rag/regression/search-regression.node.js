const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { loadArticleRegressionCases } = require('../lib/regression-cases');
const { SemanticSearchEngine } = require('../lib/search-engine');
const {
  DEFAULT_RELEVANCE,
  cosineSimilarity,
  lexicalMatchScore,
  median
} = require('../lib/ranking');

const repoRoot = path.resolve(__dirname, '..', '..');
const postsDir = path.join(repoRoot, 'posts');
const archiveDir = path.join(repoRoot, 'archive');
const casesDir = path.join(__dirname, 'cases');
const noResultsPath = path.join(casesDir, '_no-results.json');

function registerPositiveQueries(fixtures, seenQueries) {
  for (const fixture of fixtures.values()) {
    for (const regressionCase of fixture.queries) {
      const normalized = regressionCase.query.toLocaleLowerCase('de-DE');
      const duplicateOwner = seenQueries.get(normalized);
      assert.equal(
        duplicateOwner,
        undefined,
        `Duplicate regression query in ${duplicateOwner} and ${fixture.post}: ${regressionCase.query}`
      );
      seenQueries.set(normalized, fixture.post);
    }
  }
}

async function loadNoResultQueries(seenQueries) {
  const fixture = JSON.parse(await fs.readFile(noResultsPath, 'utf8'));
  assert.ok(Array.isArray(fixture.queries), '_no-results.json: "queries" must be an array');
  assert.ok(fixture.queries.length > 0, '_no-results.json: add at least one negative query');

  const queries = fixture.queries.map((value, index) => {
    assert.equal(typeof value, 'string', `_no-results.json query ${index + 1}: query must be a string`);
    const query = value.trim();
    assert.ok(query.length >= 2, `_no-results.json query ${index + 1}: query is too short`);
    const normalized = query.toLocaleLowerCase('de-DE');
    assert.equal(seenQueries.has(normalized), false, `Negative query is also a positive regression query: ${query}`);
    seenQueries.set(normalized, '_no-results.json');
    return query;
  });

  assert.equal(
    new Set(queries.map((query) => query.toLocaleLowerCase('de-DE'))).size,
    queries.length,
    '_no-results.json contains duplicate queries'
  );
  return queries;
}

async function regressionSuite() {
  const activeFixtures = await loadArticleRegressionCases(postsDir);
  const archivedFixtures = await loadArticleRegressionCases(archiveDir);
  const fixtures = new Map([...archivedFixtures, ...activeFixtures]);
  const activeSlugs = [...activeFixtures.keys()].sort();
  const seenQueries = new Map();

  registerPositiveQueries(fixtures, seenQueries);
  const noResultQueries = await loadNoResultQueries(seenQueries);

  return {
    activeFixtures,
    activeSlugs,
    archivedFixtures,
    fixtures,
    noResultQueries
  };
}

function fixed(value) {
  return Number(value || 0).toFixed(4);
}

async function diagnoseQuery(engine, query, expectedSlug = '') {
  const queryEmbedding = await engine.embedder.embedQuery(query);
  const bestByPost = new Map();

  for (const chunk of engine.chunks) {
    const semanticScore = cosineSimilarity(queryEmbedding, chunk.embedding);
    const lexicalScore = lexicalMatchScore(query, chunk);
    const chunkRankScore = semanticScore + (lexicalScore * DEFAULT_RELEVANCE.lexicalBoost);
    const existing = bestByPost.get(chunk.post_id);

    if (!existing || chunkRankScore > existing.chunkRankScore) {
      bestByPost.set(chunk.post_id, {
        slug: chunk.slug,
        semanticScore,
        lexicalScore,
        chunkRankScore
      });
    }
  }

  const candidates = [...bestByPost.values()];
  const semanticBaseline = median(candidates.map((candidate) => candidate.semanticScore));
  const diagnosed = candidates.map((candidate) => {
    const semanticLift = candidate.semanticScore - semanticBaseline;
    const lexicalQualified = candidate.lexicalScore >= DEFAULT_RELEVANCE.minLexicalScore
      && candidate.semanticScore >= DEFAULT_RELEVANCE.minLexicalSemanticScore;
    const semanticQualified = candidate.semanticScore >= DEFAULT_RELEVANCE.minSemanticScore
      && semanticLift >= DEFAULT_RELEVANCE.minSemanticLift;

    return {
      ...candidate,
      semanticLift,
      relevanceScore: candidate.chunkRankScore + Math.max(0, semanticLift),
      relevant: lexicalQualified || semanticQualified
    };
  }).sort((left, right) => right.relevanceScore - left.relevanceScore);

  const formatCandidate = (candidate) => {
    if (!candidate) {
      return '<missing>';
    }
    return `${candidate.slug}{sem=${fixed(candidate.semanticScore)},lift=${fixed(candidate.semanticLift)},lex=${fixed(candidate.lexicalScore)},rel=${fixed(candidate.relevanceScore)},gate=${candidate.relevant ? 'pass' : 'reject'}}`;
  };

  const expected = expectedSlug
    ? diagnosed.find((candidate) => candidate.slug === expectedSlug)
    : null;

  return [
    `baseline=${fixed(semanticBaseline)}`,
    expectedSlug ? `expected=${formatCandidate(expected)}` : '',
    `top=${diagnosed.slice(0, 5).map(formatCandidate).join(' | ')}`
  ].filter(Boolean).join(' ; ');
}

test('active articles define semantic search regression queries in frontmatter', async () => {
  const { activeFixtures } = await regressionSuite();
  const missing = [...activeFixtures.values()]
    .filter((fixture) => fixture.queries.length === 0)
    .map((fixture) => fixture.post);

  assert.deepEqual(
    missing,
    [],
    `Every active post needs search_queries in its frontmatter. Missing: ${missing.join(', ')}`
  );
});

test('per-article regression JSON fixtures are not used anymore', async () => {
  const entries = await fs.readdir(casesDir, { withFileTypes: true });
  const legacyFixtures = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== '_no-results.json')
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(
    legacyFixtures,
    [],
    `Move these regression queries into article frontmatter and delete the JSON fixtures: ${legacyFixtures.join(', ')}`
  );
});

test('Kernel Grep keeps expected semantic search results stable', { timeout: 20 * 60_000 }, async () => {
  const { activeSlugs, fixtures, noResultQueries } = await regressionSuite();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-grep-regression-'));
  const engineOptions = {
    databasePath: path.join(root, 'regression.duckdb'),
    cacheDir: process.env.RAG_MODEL_CACHE || path.join(repoRoot, '.data', 'huggingface'),
    postsDir,
    embedderMode: process.env.RAG_REGRESSION_EMBEDDER_MODE || 'e5'
  };

  if (process.env.RAG_MODEL) {
    engineOptions.model = process.env.RAG_MODEL;
  }
  if (process.env.RAG_DTYPE) {
    engineOptions.dtype = process.env.RAG_DTYPE;
  }

  const engine = await SemanticSearchEngine.create(engineOptions);
  const failures = [];

  try {
    for (const slug of activeSlugs) {
      const fixture = fixtures.get(slug);
      if (!fixture) {
        continue;
      }

      for (const regressionCase of fixture.queries) {
        const maxRank = regressionCase.maxRank;
        const results = await engine.search(regressionCase.query, Math.max(5, maxRank));
        const rankIndex = results.findIndex((result) => result.slug === slug);

        if (rankIndex < 0 || rankIndex + 1 > maxRank) {
          const actual = results.map((result, index) => `${index + 1}:${result.slug}`).join(', ') || '<no results>';
          const diagnostic = await diagnoseQuery(engine, regressionCase.query, slug);
          failures.push(`POSITIVE | "${regressionCase.query}" | expected ${slug} at rank <= ${maxRank} | got ${actual} | ${diagnostic}`);
        }
      }
    }

    for (const query of noResultQueries) {
      const results = await engine.search(query, 5);
      if (results.length > 0) {
        const diagnostic = await diagnoseQuery(engine, query);
        failures.push(`NEGATIVE | "${query}" | expected no results | got ${results.map((result, index) => `${index + 1}:${result.slug}`).join(', ')} | ${diagnostic}`);
      }
    }

    assert.deepEqual(
      failures,
      [],
      `Semantic search regression failures (${failures.length}):\n${failures.join('\n')}`
    );
  } finally {
    engine.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
