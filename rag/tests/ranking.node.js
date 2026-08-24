const assert = require('node:assert/strict');
const test = require('node:test');
const {
  cosineSimilarity,
  lexicalMatchScore,
  rankChunks,
  tokens
} = require('../lib/ranking');

test('cosineSimilarity ranks aligned vectors highest', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test('lexicalMatchScore prefers title and tag evidence and supports prefixes', () => {
  const chunk = {
    title: 'Docker Compose auf Hetzner',
    tags: ['docker', 'deployment'],
    heading: 'Container starten',
    category: 'Self-Hosting',
    excerpt: '',
    content: 'Mehrere Services werden gemeinsam gestartet.'
  };

  assert.ok(lexicalMatchScore('dock container', chunk) > 0.7);
  assert.equal(lexicalMatchScore('qwertzuiop', chunk), 0);
});

test('query tokenization removes common German filler words and inflections', () => {
  assert.deepEqual(
    tokens('Wie kann ich einen Dienst mit meiner Admin Oberfläche schützen?', { removeStopWords: true }),
    ['dienst', 'admin', 'oberflache', 'schutzen']
  );
});

test('rankChunks returns only the best relevant chunk per post', () => {
  const chunks = [
    { post_id: 'a', chunk_id: 'a1', title: 'Docker Compose', tags: ['docker'], embedding: [1, 0] },
    { post_id: 'a', chunk_id: 'a2', title: 'Docker Compose', tags: ['docker'], embedding: [0.8, 0.2] },
    { post_id: 'b', chunk_id: 'b1', title: 'RSS Reader', tags: ['rss'], embedding: [0, 1] }
  ];

  const results = rankChunks(chunks, [1, 0], 'docker compose', 5);
  assert.equal(results.length, 1);
  assert.equal(results[0].chunk_id, 'a1');
  assert.equal(results[0].post_id, 'a');
});

test('rankChunks rejects uniformly weak semantic matches without lexical evidence', () => {
  const chunks = [
    { post_id: 'a', chunk_id: 'a1', title: 'Docker', embedding: [0.82, 0.5724] },
    { post_id: 'b', chunk_id: 'b1', title: 'RSS', embedding: [0.81, 0.5864] },
    { post_id: 'c', chunk_id: 'c1', title: 'AWS', embedding: [0.8, 0.6] }
  ];

  const results = rankChunks(chunks, [1, 0], 'aksdfnasdglvhnasdf', 8);
  assert.deepEqual(results, []);
});

test('rankChunks rejects lexical-only matches when semantic similarity is too weak', () => {
  const chunks = [
    { post_id: 'a', chunk_id: 'a1', title: 'Käsekuchen Docker', embedding: [0.75, 0.6614] },
    { post_id: 'b', chunk_id: 'b1', title: 'RSS', embedding: [0.74, 0.6726] },
    { post_id: 'c', chunk_id: 'c1', title: 'AWS', embedding: [0.73, 0.6834] }
  ];

  const results = rankChunks(chunks, [1, 0], 'Käsekuchen', 8);
  assert.deepEqual(results, []);
});

test('rankChunks keeps a clearly separated semantic match without exact words', () => {
  const chunks = [
    { post_id: 'a', chunk_id: 'a1', title: 'Artikel A', embedding: [0.93, 0.3676] },
    { post_id: 'b', chunk_id: 'b1', title: 'Artikel B', embedding: [0.8, 0.6] },
    { post_id: 'c', chunk_id: 'c1', title: 'Artikel C', embedding: [0.79, 0.6131] }
  ];

  const results = rankChunks(chunks, [1, 0], 'inhaltlich andere formulierung', 8);
  assert.equal(results.length, 1);
  assert.equal(results[0].post_id, 'a');
});
