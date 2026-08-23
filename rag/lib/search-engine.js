const path = require('node:path');
const { buildIndex, defaultOptions } = require('../index');
const { createEmbedder } = require('./embedder-factory');
const {
  buildPostProfiles,
  globalSemanticRelations,
  semanticRelations
} = require('./knowledge-graph');
const { rankChunks } = require('./ranking');
const { RagStore } = require('./store');

class SemanticSearchEngine {
  constructor(options, embedder, embeddingModel, store, chunks, postProfiles, indexStats) {
    this.options = options;
    this.embedder = embedder;
    this.embeddingModel = embeddingModel;
    this.store = store;
    this.chunks = chunks;
    this.postProfiles = postProfiles;
    this.indexStats = indexStats;
  }

  static async create(inputOptions = {}) {
    const options = { ...defaultOptions(), ...inputOptions };
    const created = createEmbedder({
      mode: options.embedderMode,
      model: options.model,
      dtype: options.dtype,
      cacheDir: options.cacheDir
    });

    const indexStats = await buildIndex(
      { ...options, quiet: true },
      created
    );
    const store = await RagStore.open(options.databasePath);
    const chunks = await store.allChunks(created.embeddingModel);

    if (chunks.length === 0) {
      store.close();
      throw new Error(`No semantic chunks available for ${created.embeddingModel}`);
    }

    const postProfiles = buildPostProfiles(chunks);
    if (postProfiles.length === 0) {
      store.close();
      throw new Error(`No semantic article profiles available for ${created.embeddingModel}`);
    }

    return new SemanticSearchEngine(
      options,
      created.embedder,
      created.embeddingModel,
      store,
      chunks,
      postProfiles,
      indexStats
    );
  }

  async search(query, limit = 8) {
    const normalizedQuery = String(query || '').trim();
    if (normalizedQuery.length < 2) {
      throw new Error('Query must contain at least two characters');
    }

    const safeLimit = Math.min(12, Math.max(1, Number(limit) || 8));
    const queryEmbedding = await this.embedder.embedQuery(normalizedQuery);
    return rankChunks(this.chunks, queryEmbedding, normalizedQuery, safeLimit).map((result) => ({
      score: result.score,
      relevanceScore: result.relevanceScore,
      lexicalScore: result.lexicalScore,
      title: result.title,
      slug: result.slug,
      url: `/posts/${result.slug}`,
      heading: result.heading || '',
      content: result.content,
      category: result.category || '',
      tags: result.tags || [],
      excerpt: result.excerpt || ''
    }));
  }

  knowledgeGraph(slug, limit = 8) {
    const graph = semanticRelations(this.postProfiles, slug, limit);
    if (!graph) {
      return null;
    }

    return {
      embeddingModel: this.embeddingModel,
      ...graph
    };
  }

  globalKnowledgeGraph(limit = 4) {
    return {
      embeddingModel: this.embeddingModel,
      ...globalSemanticRelations(this.postProfiles, limit)
    };
  }

  info() {
    return {
      embeddingModel: this.embeddingModel,
      embedderMode: this.indexStats.embedderMode,
      indexedPosts: this.indexStats.indexed,
      unchangedPosts: this.indexStats.skipped,
      removedPosts: this.indexStats.removed,
      chunks: this.chunks.length,
      postProfiles: this.postProfiles.length,
      database: path.basename(this.options.databasePath)
    };
  }

  close() {
    this.store.close();
  }
}

module.exports = {
  SemanticSearchEngine
};
