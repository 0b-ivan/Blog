const assert = require('node:assert/strict');
const test = require('node:test');
const {
  averageEmbedding,
  buildPostProfiles,
  globalSemanticRelations,
  semanticRelations,
  sharedTags
} = require('../lib/knowledge-graph');

test('averageEmbedding creates a normalized article vector from chunk vectors', () => {
  const vector = averageEmbedding([
    [1, 0],
    [1, 0]
  ]);

  assert.equal(vector.length, 2);
  assert.ok(Math.abs(vector[0] - 1) < 1e-9);
  assert.ok(Math.abs(vector[1]) < 1e-9);
});

test('semanticRelations combines vector similarity with explainable metadata signals', () => {
  const chunks = [
    {
      post_id: 'a',
      slug: 'docker-compose',
      title: 'Docker Compose',
      category: 'Container',
      tags: ['Docker', 'Compose'],
      excerpt: 'Container gemeinsam starten',
      embedding: [1, 0, 0]
    },
    {
      post_id: 'a',
      slug: 'docker-compose',
      title: 'Docker Compose',
      category: 'Container',
      tags: ['Docker', 'Compose'],
      excerpt: 'Container gemeinsam starten',
      embedding: [0.95, 0.05, 0]
    },
    {
      post_id: 'b',
      slug: 'docker-deployment',
      title: 'Docker Deployment',
      category: 'Container',
      tags: ['Docker', 'Deployment'],
      excerpt: 'Container deployen',
      embedding: [0.98, 0.02, 0]
    },
    {
      post_id: 'c',
      slug: 'rss-reader',
      title: 'RSS Reader',
      category: 'Self-Hosting',
      tags: ['RSS'],
      excerpt: 'Feeds lesen',
      embedding: [0, 1, 0]
    }
  ];

  const profiles = buildPostProfiles(chunks);
  assert.equal(profiles.length, 3);
  assert.deepEqual(sharedTags(['Docker', 'Compose'], ['docker', 'Deployment']), ['Docker']);

  const graph = semanticRelations(profiles, 'docker-compose', 5);
  assert.ok(graph);
  assert.equal(graph.source.slug, 'docker-compose');
  assert.equal(graph.related[0].slug, 'docker-deployment');
  assert.ok(graph.related[0].similarity > graph.related[1].similarity);
  assert.deepEqual(graph.related[0].sharedTags, ['Docker']);
  assert.equal(graph.related[0].sameCategory, true);
  assert.ok(graph.related[0].relationScore > graph.related[1].relationScore);
  assert.equal('embedding' in graph.related[0], false, 'raw vectors must never leave the service');

  const globalGraph = globalSemanticRelations(profiles, 2);
  assert.equal(globalGraph.articles.length, 3);
  assert.ok(globalGraph.edges.length >= 1);
  assert.equal(globalGraph.edges[0].source, 'docker-compose');
  assert.equal(globalGraph.edges[0].target, 'docker-deployment');
  assert.ok(globalGraph.edges[0].similarity > 0.9);
  assert.deepEqual(globalGraph.edges[0].sharedTags, ['Docker']);
  assert.equal('embedding' in globalGraph.articles[0], false, 'global API must not expose raw vectors');
});
