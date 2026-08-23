const fs = require('node:fs/promises');
const path = require('node:path');
const { createEmbedder } = require('./lib/embedder-factory');
const { retrieveGraphContext } = require('./lib/graphrag');
const { buildPostProfiles } = require('./lib/knowledge-graph');
const { rankChunks } = require('./lib/ranking');
const { RagStore } = require('./lib/store');

const repoRoot = path.join(__dirname, '..');

function parseOptions(args) {
  const options = {
    databasePath: process.env.RAG_DB_PATH || path.join(repoRoot, '.data', 'kernel-notes.duckdb'),
    cacheDir: process.env.RAG_MODEL_CACHE || path.join(repoRoot, '.data', 'huggingface'),
    model: process.env.RAG_MODEL,
    dtype: process.env.RAG_DTYPE,
    embedderMode: process.env.RAG_EMBEDDER_MODE || 'e5',
    seedLimit: 3,
    neighborsPerSeed: 2,
    maxChunks: 8,
    maxChars: 12_000,
    json: false,
    query: ''
  };

  const queryParts = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];

    if (argument === '--db' && value) {
      options.databasePath = path.resolve(value);
      index += 1;
    } else if (argument === '--model' && value) {
      options.model = value;
      index += 1;
    } else if (argument === '--dtype' && value) {
      options.dtype = value;
      index += 1;
    } else if (argument === '--seed-limit' && value) {
      options.seedLimit = Number(value);
      index += 1;
    } else if (argument === '--neighbors' && value) {
      options.neighborsPerSeed = Number(value);
      index += 1;
    } else if (argument === '--limit' && value) {
      options.maxChunks = Number(value);
      index += 1;
    } else if (argument === '--max-chars' && value) {
      options.maxChars = Number(value);
      index += 1;
    } else if (argument === '--json') {
      options.json = true;
    } else if (argument.startsWith('--')) {
      throw new Error(`Unknown or incomplete option: ${argument}`);
    } else {
      queryParts.push(argument);
    }
  }

  options.query = queryParts.join(' ').trim();
  if (!options.query) {
    throw new Error('Usage: npm run rag:context -- "Frage" [--seed-limit 3] [--neighbors 2] [--limit 8] [--max-chars 12000] [--json]');
  }

  return options;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  try {
    await fs.access(options.databasePath);
  } catch (error) {
    throw new Error(`Semantic index not found: ${options.databasePath}. Run npm run rag:index first.`, {
      cause: error
    });
  }

  const created = createEmbedder({
    mode: options.embedderMode,
    model: options.model,
    dtype: options.dtype,
    cacheDir: options.cacheDir
  });
  const store = await RagStore.open(options.databasePath);

  try {
    const chunks = await store.allChunks(created.embeddingModel);
    if (chunks.length === 0) {
      throw new Error(`No chunks found for model ${created.embeddingModel}. Rebuild the index with the same model.`);
    }

    const profiles = buildPostProfiles(chunks);
    const queryEmbedding = await created.embedder.embedQuery(options.query);
    const seedLimit = Math.min(6, Math.max(1, Number(options.seedLimit) || 3));
    const seeds = rankChunks(chunks, queryEmbedding, options.query, seedLimit);
    const retrieval = {
      query: options.query,
      embeddingModel: created.embeddingModel,
      ...retrieveGraphContext({
        chunks,
        profiles,
        query: options.query,
        queryEmbedding,
        seeds,
        neighborsPerSeed: options.neighborsPerSeed,
        maxChunks: options.maxChunks,
        maxChars: options.maxChars
      })
    };

    if (options.json) {
      console.log(JSON.stringify(retrieval, null, 2));
      return;
    }

    console.log(`GraphRAG: ${options.query}`);
    console.log(`Strategie: ${retrieval.strategy}`);
    console.log(`Direkte Treffer: ${retrieval.seeds.length}`);
    console.log(`Graph-Erweiterungen: ${retrieval.expandedArticles.length}`);
    console.log(`Kontext-Chunks: ${retrieval.context.length} (${retrieval.contextCharacters} Zeichen)`);
    console.log('');

    if (!retrieval.promptContext) {
      console.log('Kein relevanter Kontext gefunden.');
      return;
    }

    console.log(retrieval.promptContext);
  } finally {
    store.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  parseOptions
};
