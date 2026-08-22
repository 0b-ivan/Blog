const assert = require('node:assert/strict');
const test = require('node:test');
const { cosineSimilarity, rankChunks } = require('../lib/ranking');

test('cosineSimilarity ranks aligned vectors highest', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test('rankChunks returns only the best chunk per post', () => {
  const chunks = [
    { post_id: 'a', chunk_id: 'a1', embedding: [1, 0] },
    { post_id: 'a', chunk_id: 'a2', embedding: [0.8, 0.2] },
    { post_id: 'b', chunk_id: 'b1', embedding: [0, 1] }
  ];

  const results = rankChunks(chunks, [1, 0], 5);
  assert.equal(results.length, 2);
  assert.equal(results[0].chunk_id, 'a1');
  assert.equal(results[1].post_id, 'b');
});
