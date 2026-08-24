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

    const graphRag = await engine.retrieveGraphContext('docker compose container', {
      seedLimit: 1,
      neighborsPerSeed: 0,
      maxChunks: 3,
      maxChars: 4_000
    });
    assert.equal(graphRag.query, 'docker compose container');
    assert.equal(graphRag.embeddingModel, engine.embeddingModel);
    assert.equal(graphRag.strategy, 'semantic-search+1-hop-knowledge-graph');
    assert.equal(graphRag.seeds[0].slug, 'docker-compose');
    assert.equal(graphRag.context[0].citation, 'K1');
    assert.equal(graphRag.context[0].slug, 'docker-compose');
    assert.ok(graphRag.promptContext.includes('[K1] Docker Compose'));
    assert.equal('embedding' in graphRag.context[0], false, 'GraphRAG context must not expose embeddings');

    const graph = engine.knowledgeGraph('docker-compose', 5);
    assert.ok(graph);
    assert.equal(graph.source.slug, 'docker-compose');
    assert.equal(graph.embeddingModel, engine.embeddingModel);
    assert.ok(Array.isArray(graph.related));
    assert.equal('embedding' in graph.source, false, 'article vectors must stay inside the RAG service');

    const globalGraph = engine.globalKnowledgeGraph(3);
    assert.equal(globalGraph.embeddingModel, engine.embeddingModel);
    assert.equal(globalGraph.articles.length, 2);
    assert.ok(Array.isArray(globalGraph.edges));
    assert.equal('embedding' in globalGraph.articles[0], false, 'global graph must not expose article vectors');

    assert.equal(engine.info().embedderMode, 'hash');
    assert.equal(engine.info().chunks, 2);
    assert.equal(engine.info().postProfiles, 2);
    assert.equal(engine.info().reindexing, false);

    const previousChunks = engine.chunks;
    await fs.rm(path.join(postsDir, 'rss.md'));
    await writePost(
      postsDir,
      'kubernetes',
      'title: Kubernetes Deployment\ncategory: Container\ntags:\n  - kubernetes',
      '## Rollout\n\nKubernetes aktualisiert Deployments mit kontrollierten Rollouts.'
    );

    const reindex = engine.reindex();
    assert.equal(engine.info().reindexing, true);

    const duringReindex = await engine.search('FreshRSS selbst gehosteter Feed Reader', 5);
    assert.ok(
      duringReindex.some((result) => result.slug === 'rss'),
      'Search must keep serving the previous in-memory index while reindexing'
    );

    await reindex;

    assert.equal(engine.info().reindexing, false);
    assert.notEqual(engine.chunks, previousChunks, 'Reindex must swap in a new chunk snapshot');
    assert.equal(engine.chunks.some((chunk) => chunk.slug === 'rss'), false);
    assert.ok(engine.chunks.some((chunk) => chunk.slug === 'kubernetes'));
    assert.equal(engine.info().indexedPosts, 1);
    assert.equal(engine.info().unchangedPosts, 1);
    assert.equal(engine.info().removedPosts, 1);

    const afterReindex = await engine.search('kubernetes deployment rollout', 5);
    assert.ok(afterReindex.some((result) => result.slug === 'kubernetes'));
  } finally {
    engine.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
