const assert = require('node:assert/strict');
const test = require('node:test');
const { retrieveGraphContext } = require('../lib/graphrag');
const { buildPostProfiles } = require('../lib/knowledge-graph');

function chunk({
  id,
  postId,
  slug,
  title,
  category,
  tags,
  heading,
  content,
  embedding,
  ordinal = 0
}) {
  return {
    chunk_id: id,
    post_id: postId,
    ordinal,
    heading,
    content,
    embedding,
    slug,
    title,
    category,
    tags,
    excerpt: content.slice(0, 80)
  };
}

const chunks = [
  chunk({
    id: 'a-1',
    postId: 'a',
    slug: 'docker-compose',
    title: 'Docker Compose',
    category: 'Container',
    tags: ['Docker', 'Compose'],
    heading: 'Mehrere Container',
    content: 'Docker Compose startet mehrere Container gemeinsam aus einer Compose-Datei.',
    embedding: [1, 0, 0]
  }),
  chunk({
    id: 'a-2',
    postId: 'a',
    slug: 'docker-compose',
    title: 'Docker Compose',
    category: 'Container',
    tags: ['Docker', 'Compose'],
    heading: 'Netzwerke',
    content: 'Compose verbindet Services über gemeinsame Docker Netzwerke.',
    embedding: [0.92, 0.08, 0],
    ordinal: 1
  }),
  chunk({
    id: 'b-1',
    postId: 'b',
    slug: 'docker-deployment',
    title: 'Docker Deployment',
    category: 'Container',
    tags: ['Docker', 'Deployment'],
    heading: 'Deployment',
    content: 'Container Deployments werden auf dem Server reproduzierbar ausgerollt.',
    embedding: [0.97, 0.03, 0]
  }),
  chunk({
    id: 'c-1',
    postId: 'c',
    slug: 'rss-reader',
    title: 'RSS Reader',
    category: 'Self-Hosting',
    tags: ['RSS'],
    heading: 'Feeds',
    content: 'Ein RSS Reader sammelt Feeds und neue Artikel.',
    embedding: [0, 1, 0]
  })
];

const profiles = buildPostProfiles(chunks);
const seed = {
  ...chunks[0],
  score: 0.99,
  relevanceScore: 1.08,
  lexicalScore: 1
};
const secondSeed = {
  ...chunks[2],
  score: 0.96,
  relevanceScore: 1.02,
  lexicalScore: 0.8
};

test('GraphRAG keeps direct hits and expands one hop through semantic article relations', () => {
  const result = retrieveGraphContext({
    chunks,
    profiles,
    query: 'docker container deployment',
    queryEmbedding: [1, 0, 0],
    seeds: [seed],
    neighborsPerSeed: 1,
    maxChunks: 3,
    maxChars: 5_000
  });

  assert.equal(result.strategy, 'semantic-search+1-hop-knowledge-graph');
  assert.equal(result.seeds[0].slug, 'docker-compose');
  assert.equal(result.expandedArticles[0].slug, 'docker-deployment');
  assert.equal(result.expandedArticles.some((article) => article.slug === 'rss-reader'), false);

  assert.equal(result.context[0].slug, 'docker-compose', 'direct seed must stay represented');
  assert.ok(result.context.some((entry) => entry.slug === 'docker-deployment' && entry.origin === 'graph'));
  assert.deepEqual(result.context.map((entry) => entry.citation), ['K1', 'K2', 'K3']);
  assert.ok(result.promptContext.includes('[K1] Docker Compose'));
  assert.ok(result.promptContext.includes('Graph-Nachbar via Docker Compose'));
  assert.ok(result.sources.some((source) => source.slug === 'docker-deployment'));
  assert.equal('embedding' in result.context[0], false, 'raw vectors must never leave retrieval');
});

test('GraphRAG can run in direct-only mode and obeys the context chunk cap', () => {
  const result = retrieveGraphContext({
    chunks,
    profiles,
    query: 'docker compose',
    queryEmbedding: [1, 0, 0],
    seeds: [seed],
    neighborsPerSeed: 0,
    maxChunks: 1,
    maxChars: 2_000
  });

  assert.deepEqual(result.expandedArticles, []);
  assert.equal(result.context.length, 1);
  assert.equal(result.context[0].origin, 'direct');
  assert.equal(result.sources.length, 1);
});

test('GraphRAG raises the effective chunk cap to preserve every direct seed article', () => {
  const result = retrieveGraphContext({
    chunks,
    profiles,
    query: 'docker container',
    queryEmbedding: [1, 0, 0],
    seeds: [seed, secondSeed],
    neighborsPerSeed: 0,
    maxChunks: 1,
    maxChars: 2_000
  });

  assert.equal(result.limits.maxChunks, 2);
  assert.deepEqual(
    new Set(result.context.map((entry) => entry.slug)),
    new Set(['docker-compose', 'docker-deployment'])
  );
  assert.equal(result.context.every((entry) => entry.origin === 'direct'), true);
});

test('GraphRAG returns an empty, LLM-safe context when semantic search has no seeds', () => {
  const result = retrieveGraphContext({
    chunks,
    profiles,
    query: 'unrelated',
    queryEmbedding: [0, 0, 1],
    seeds: []
  });

  assert.deepEqual(result.context, []);
  assert.deepEqual(result.sources, []);
  assert.equal(result.promptContext, '');
  assert.equal(result.contextCharacters, 0);
});
