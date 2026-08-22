const assert = require('node:assert/strict');
const test = require('node:test');
const { RagStore } = require('../lib/store');

function document(postId, sourceHash) {
  return {
    postId,
    slug: postId,
    title: `Title ${postId}`,
    category: 'Test',
    tags: ['duckdb', 'rag'],
    excerpt: 'Test excerpt',
    sourcePath: `posts/${postId}.md`,
    sourceHash,
    updatedAt: '2026-08-22'
  };
}

test('RagStore replaces chunks and exposes incremental document state', async () => {
  const store = await RagStore.open(':memory:');
  try {
    await store.replaceDocument(document('post-a', 'hash-a'), [
      {
        chunkId: 'post-a:0:a',
        ordinal: 0,
        heading: 'A',
        content: 'first',
        contentHash: 'chunk-a',
        embedding: [1, 0, 0]
      },
      {
        chunkId: 'post-a:1:b',
        ordinal: 1,
        heading: 'B',
        content: 'second',
        contentHash: 'chunk-b',
        embedding: [0, 1, 0]
      }
    ], 'test-model');

    const state = await store.documentState('post-a');
    assert.equal(state.source_hash, 'hash-a');
    assert.equal(state.embedding_model, 'test-model');
    assert.equal(Number(state.chunk_count), 2);

    await store.replaceDocument(document('post-a', 'hash-b'), [
      {
        chunkId: 'post-a:0:c',
        ordinal: 0,
        heading: 'C',
        content: 'replacement',
        contentHash: 'chunk-c',
        embedding: [0, 0, 1]
      }
    ], 'test-model');

    const chunks = await store.allChunks('test-model');
    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0].embedding, [0, 0, 1]);
    assert.deepEqual(chunks[0].tags, ['duckdb', 'rag']);
  } finally {
    store.close();
  }
});

test('RagStore removes documents that disappeared from posts', async () => {
  const store = await RagStore.open(':memory:');
  try {
    await store.replaceDocument(document('post-a', 'hash-a'), [{
      chunkId: 'post-a:0:a',
      ordinal: 0,
      heading: '',
      content: 'a',
      contentHash: 'a',
      embedding: [1, 0]
    }], 'test-model');
    await store.replaceDocument(document('post-b', 'hash-b'), [{
      chunkId: 'post-b:0:b',
      ordinal: 0,
      heading: '',
      content: 'b',
      contentHash: 'b',
      embedding: [0, 1]
    }], 'test-model');

    assert.equal(await store.removeDocumentsNotIn(['post-a']), 1);
    const chunks = await store.allChunks('test-model');
    assert.deepEqual(chunks.map((chunk) => chunk.post_id), ['post-a']);
  } finally {
    store.close();
  }
});
