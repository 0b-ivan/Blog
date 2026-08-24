const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { SemanticSearchEngine } = require('../lib/search-engine');

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

  try {
    for (const slug of activeSlugs) {
      const fixture = fixtures.get(slug);
      for (const regressionCase of fixture.queries) {
        const maxRank = regressionCase.maxRank ?? 1;
        const results = await engine.search(regressionCase.query, Math.max(5, maxRank));
        const rankIndex = results.findIndex((result) => result.slug === slug);
        const actual = results.map((result, index) => `${index + 1}:${result.slug}`).join(', ') || '<no results>';

        assert.ok(
          rankIndex >= 0 && rankIndex + 1 <= maxRank,
          `Query "${regressionCase.query}" expected ${slug} at rank <= ${maxRank}, got ${actual}`
        );
      }
    }

    for (const query of noResultQueries) {
      const results = await engine.search(query, 5);
      assert.deepEqual(
        results,
        [],
        `Query "${query}" should return no result, got ${results.map((result) => result.slug).join(', ')}`
      );
    }
  } finally {
    engine.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
