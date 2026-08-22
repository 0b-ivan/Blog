class RagStore {
  constructor(instance, connection, duckdb) {
    this.instance = instance;
    this.connection = connection;
    this.duckdb = duckdb;
  }

  static async open(databasePath) {
    const duckdb = await import('@duckdb/node-api');
    const instance = await duckdb.DuckDBInstance.create(databasePath);
    const connection = await instance.connect();
    const store = new RagStore(instance, connection, duckdb);
    await store.initialize();
    return store;
  }

  async initialize() {
    await this.connection.run(`
      CREATE TABLE IF NOT EXISTS rag_documents (
        post_id VARCHAR PRIMARY KEY,
        slug VARCHAR NOT NULL,
        title VARCHAR NOT NULL,
        category VARCHAR,
        tags_json VARCHAR NOT NULL,
        excerpt VARCHAR,
        source_path VARCHAR NOT NULL,
        source_hash VARCHAR NOT NULL,
        updated_at VARCHAR,
        indexed_at TIMESTAMP NOT NULL DEFAULT (now())
      )
    `);

    await this.connection.run(`
      CREATE TABLE IF NOT EXISTS rag_chunks (
        chunk_id VARCHAR PRIMARY KEY,
        post_id VARCHAR NOT NULL,
        ordinal INTEGER NOT NULL,
        heading VARCHAR,
        content VARCHAR NOT NULL,
        content_hash VARCHAR NOT NULL,
        embedding_model VARCHAR NOT NULL,
        embedding FLOAT[] NOT NULL,
        indexed_at TIMESTAMP NOT NULL DEFAULT (now())
      )
    `);

    await this.connection.run('CREATE INDEX IF NOT EXISTS rag_chunks_post_id_idx ON rag_chunks(post_id)');
  }

  async documentState(postId) {
    const reader = await this.connection.runAndReadAll(
      `SELECT
         d.post_id,
         d.source_hash,
         min(c.embedding_model) AS embedding_model,
         count(c.chunk_id)::INTEGER AS chunk_count
       FROM rag_documents d
       LEFT JOIN rag_chunks c ON c.post_id = d.post_id
       WHERE d.post_id = $post_id
       GROUP BY d.post_id, d.source_hash`,
      { post_id: postId }
    );
    return reader.getRowObjectsJson()[0] || null;
  }

  async replaceDocument(document, chunks, embeddingModel) {
    await this.connection.run('BEGIN TRANSACTION');
    try {
      await this.connection.run(
        `INSERT INTO rag_documents (
           post_id, slug, title, category, tags_json, excerpt, source_path, source_hash, updated_at, indexed_at
         ) VALUES (
           $post_id, $slug, $title, $category, $tags_json, $excerpt, $source_path, $source_hash, $updated_at, now()
         )
         ON CONFLICT (post_id) DO UPDATE SET
           slug = excluded.slug,
           title = excluded.title,
           category = excluded.category,
           tags_json = excluded.tags_json,
           excerpt = excluded.excerpt,
           source_path = excluded.source_path,
           source_hash = excluded.source_hash,
           updated_at = excluded.updated_at,
           indexed_at = now()`,
        {
          post_id: document.postId,
          slug: document.slug,
          title: document.title,
          category: document.category || '',
          tags_json: JSON.stringify(document.tags || []),
          excerpt: document.excerpt || '',
          source_path: document.sourcePath,
          source_hash: document.sourceHash,
          updated_at: document.updatedAt || ''
        }
      );

      await this.connection.run('DELETE FROM rag_chunks WHERE post_id = $post_id', {
        post_id: document.postId
      });

      for (const chunk of chunks) {
        const values = {
          chunk_id: chunk.chunkId,
          post_id: document.postId,
          ordinal: chunk.ordinal,
          heading: chunk.heading || '',
          content: chunk.content,
          content_hash: chunk.contentHash,
          embedding_model: embeddingModel,
          embedding: this.duckdb.listValue(chunk.embedding)
        };
        const types = {
          chunk_id: this.duckdb.VARCHAR,
          post_id: this.duckdb.VARCHAR,
          ordinal: this.duckdb.INTEGER,
          heading: this.duckdb.VARCHAR,
          content: this.duckdb.VARCHAR,
          content_hash: this.duckdb.VARCHAR,
          embedding_model: this.duckdb.VARCHAR,
          embedding: this.duckdb.LIST(this.duckdb.FLOAT)
        };

        await this.connection.run(
          `INSERT INTO rag_chunks (
             chunk_id, post_id, ordinal, heading, content, content_hash, embedding_model, embedding, indexed_at
           ) VALUES (
             $chunk_id, $post_id, $ordinal, $heading, $content, $content_hash, $embedding_model, $embedding, now()
           )`,
          values,
          types
        );
      }

      await this.connection.run('COMMIT');
    } catch (error) {
      await this.connection.run('ROLLBACK');
      throw error;
    }
  }

  async removeDocumentsNotIn(postIds) {
    const current = new Set(postIds);
    const reader = await this.connection.runAndReadAll('SELECT post_id FROM rag_documents');
    const existing = reader.getRowObjectsJson().map((row) => row.post_id);
    let removed = 0;

    for (const postId of existing) {
      if (current.has(postId)) {
        continue;
      }
      await this.connection.run('BEGIN TRANSACTION');
      try {
        await this.connection.run('DELETE FROM rag_chunks WHERE post_id = $post_id', { post_id: postId });
        await this.connection.run('DELETE FROM rag_documents WHERE post_id = $post_id', { post_id: postId });
        await this.connection.run('COMMIT');
        removed += 1;
      } catch (error) {
        await this.connection.run('ROLLBACK');
        throw error;
      }
    }

    return removed;
  }

  async allChunks(embeddingModel) {
    const reader = await this.connection.runAndReadAll(
      `SELECT
         c.chunk_id,
         c.post_id,
         c.ordinal,
         c.heading,
         c.content,
         c.embedding,
         d.slug,
         d.title,
         d.category,
         d.tags_json,
         d.excerpt
       FROM rag_chunks c
       JOIN rag_documents d ON d.post_id = c.post_id
       WHERE c.embedding_model = $embedding_model`,
      { embedding_model: embeddingModel }
    );
    return reader.getRowObjectsJson().map((row) => ({
      ...row,
      tags: JSON.parse(row.tags_json || '[]')
    }));
  }

  close() {
    this.connection.closeSync();
  }
}

module.exports = {
  RagStore
};
