const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { embeddingText } = require('../lib/chunker');
const { HashEmbedder } = require('../lib/hash-embedder');
const { cosineSimilarity } = require('../lib/ranking');
const { SemanticSearchEngine } = require('../lib/search-engine');

async function writePost(directory, name, frontmatter, body) {
  await fs.writeFile(
    path.join(directory, `${name}.md`),
    `---\n${frontmatter}\n---\n\n${body}\n`,
    'utf8'
  );
}

test('SemanticSearchEngine returns relevant articles and rejects garbage queries', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-grep-'));
  const postsDir = path.join(root, 'posts');
  await fs.mkdir(postsDir);

  await writePost(
    postsDir,
    'docker-compose',
    'title: Docker Compose\ncategory: Container\ntags:\n  - docker\n  - compose',
    '## Mehrere Container\n\nDocker Compose startet mehrere Container aus einer Compose-Datei.'
  );
  await writePost(
    postsDir,
    'rss',
    'title: RSS Reader\ncategory: Self-Hosting\ntags:\n  - rss',
    '## FreshRSS\n\nFreshRSS ist ein selbst gehosteter Feed Reader.'
  );

  const engine = await SemanticSearchEngine.create({
    databasePath: path.join(root, 'grep.duckdb'),
    cacheDir: path.join(root, 'models'),
    postsDir,
    embedderMode: 'hash'
  });

  try {
    const directEmbedder = new HashEmbedder();
    const queryEmbedding = await directEmbedder.embedQuery('docker compose container');
    const directDocumentEmbedding = (await directEmbedder.embedDocuments([
      embeddingText({
        title: 'Docker Compose',
        heading: 'Mehrere Container',
        content: 'Docker Compose startet mehrere Container aus einer Compose-Datei.'
      })
    ]))[0];
    assert.ok(cosineSimilarity(queryEmbedding, directDocumentEmbedding) > 0, 'Hash embedder must preserve token similarity');

    const dockerChunk = engine.chunks.find((chunk) => chunk.slug === 'docker-compose');
    assert.ok(dockerChunk, 'Docker chunk missing from DuckDB');
    assert.ok(Array.isArray(dockerChunk.embedding), 'DuckDB embedding must deserialize as an array');
    assert.equal(dockerChunk.embedding.length, queryEmbedding.length, 'DuckDB embedding dimensions must survive persistence');
    assert.ok(cosineSimilarity(queryEmbedding, dockerChunk.embedding) > 0, 'Persisted DuckDB embedding must preserve similarity');

    const results = await engine.search('docker compose container', 5);
    assert.ok(results.length >= 1);
    assert.equal(results[0].slug, 'docker-compose');
    assert.equal(results[0].url, '/posts/docker-compose');
    assert.ok(results[0].score > 0);

    const garbageResults = await engine.search('aksdfnasdglvhnasdf', 5);
    assert.deepEqual(garbageResults, []);

    assert.equal(engine.info().embedderMode, 'hash');
    assert.equal(engine.info().chunks, 2);
  } finally {
    engine.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
