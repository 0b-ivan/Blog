const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
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

async function markdownSlugs(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.basename(entry.name, '.md'))
    .sort();
}

async function loadFixtures() {
  const entries = await fs.readdir(casesDir, { withFileTypes: true });
  const fixtures = new Map();
  const seenQueries = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.startsWith('_')) {
      continue;
    }

    const filePath = path.join(casesDir, entry.name);
    const fixture = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const fileSlug = path.basename(entry.name, '.json');

    assert.equal(fixture.post, fileSlug, `${entry.name}: "post" must match the fixture filename`);
    assert.ok(Array.isArray(fixture.queries), `${entry.name}: "queries" must be an array`);
    assert.ok(fixture.queries.length > 0, `${entry.name}: add at least one regression query`);
    assert.equal(fixtures.has(fixture.post), false, `Duplicate fixture for ${fixture.post}`);

    for (const [index, regressionCase] of fixture.queries.entries()) {
      assert.equal(typeof regressionCase.query, 'string', `${entry.name} query ${index + 1}: query must be a string`);
      const query = regressionCase.query.trim();
      assert.ok(query.length >= 2, `${entry.name} query ${index + 1}: query is too short`);

      const maxRank = regressionCase.maxRank ?? 1;
      assert.ok(Number.isInteger(maxRank) && maxRank >= 1 && maxRank <= 12,
        `${entry.name} query ${index + 1}: maxRank must be an integer from 1 to 12`);

      const duplicateOwner = seenQueries.get(query.toLocaleLowerCase('de-DE'));
      assert.equal(duplicateOwner, undefined, `Duplicate regression query in ${duplicateOwner} and ${entry.name}: ${query}`);
      seenQueries.set(query.toLocaleLowerCase('de-DE'), entry.name);
    }

    fixtures.set(fixture.post, fixture);
  }

  return { fixtures, seenQueries };
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

  assert.equal(new Set(queries.map((query) => query.toLocaleLowerCase('de-DE'))).size, queries.length,
    '_no-results.json contains duplicate queries');
  return queries;
}

async function regressionSuite() {
  const activeSlugs = await markdownSlugs(postsDir);
  const archivedSlugs = await markdownSlugs(archiveDir);
  const { fixtures, seenQueries } = await loadFixtures();
  const noResultQueries = await loadNoResultQueries(seenQueries);
  return { activeSlugs, archivedSlugs, fixtures, noResultQueries };
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
    const lexicalQualified = candidate.lexicalScore >= DEFAULT_RELEVANCE.minLexicalScore;
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

test('search regression fixtures cover every active article', async () => {
  const { activeSlugs, archivedSlugs, fixtures } = await regressionSuite();
  const knownSlugs = new Set([...activeSlugs, ...archivedSlugs]);

  const missing = activeSlugs.filter((slug) => !fixtures.has(slug));
  assert.deepEqual(
    missing,
    [],
    `Every active post needs a search regression fixture. Missing: ${missing.join(', ')}`
  );

  const unknown = [...fixtures.keys()].filter((slug) => !knownSlugs.has(slug));
  assert.deepEqual(
    unknown,
    [],
    `Regression fixtures must belong to an active or archived post. Unknown: ${unknown.join(', ')}`
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
        const maxRank = regressionCase.maxRank ?? 1;
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
