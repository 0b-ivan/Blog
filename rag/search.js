const fs = require('node:fs/promises');
const path = require('node:path');
const { DEFAULT_DTYPE, DEFAULT_MODEL, LocalE5Embedder } = require('./lib/embedder');
const { rankChunks } = require('./lib/ranking');
const { RagStore } = require('./lib/store');

const repoRoot = path.join(__dirname, '..');

function parseOptions(args) {
  const options = {
    databasePath: process.env.RAG_DB_PATH || path.join(repoRoot, '.data', 'kernel-notes.duckdb'),
    cacheDir: process.env.RAG_MODEL_CACHE || path.join(repoRoot, '.data', 'huggingface'),
    model: process.env.RAG_MODEL || DEFAULT_MODEL,
    dtype: process.env.RAG_DTYPE || DEFAULT_DTYPE,
    limit: Number(process.env.RAG_LIMIT || 8),
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
    } else if (argument === '--limit' && value) {
      options.limit = Number(value);
      index += 1;
    } else if (argument.startsWith('--')) {
      throw new Error(`Unknown or incomplete option: ${argument}`);
    } else {
      queryParts.push(argument);
    }
  }

  options.query = queryParts.join(' ').trim();
  if (!options.query) {
    throw new Error('Usage: npm run rag:search -- "Suchbegriff oder Frage" [--limit 8]');
  }
  return options;
}

function preview(value, maxLength = 180) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  try {
    await fs.access(options.databasePath);
  } catch (_error) {
    throw new Error(`Semantic index not found: ${options.databasePath}. Run npm run rag:index first.`);
  }

  const store = await RagStore.open(options.databasePath);
  const embedder = new LocalE5Embedder({
    model: options.model,
    dtype: options.dtype,
    cacheDir: options.cacheDir
  });

  try {
    const chunks = await store.allChunks(options.model);
    if (chunks.length === 0) {
      throw new Error(`No chunks found for model ${options.model}. Rebuild the index with the same model.`);
    }

    const queryEmbedding = await embedder.embedQuery(options.query);
    const results = rankChunks(chunks, queryEmbedding, options.limit);

    console.log(`Query: ${options.query}`);
    console.log('');
    results.forEach((result, index) => {
      const percent = `${(result.score * 100).toFixed(1)}%`.padStart(6);
      console.log(`${String(index + 1).padStart(2)}. ${percent}  ${result.title}`);
      console.log(`    /posts/${result.slug}`);
      if (result.heading) {
        console.log(`    ${result.heading}`);
      }
      console.log(`    ${preview(result.content)}`);
      console.log('');
    });
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
  parseOptions,
  preview
};
