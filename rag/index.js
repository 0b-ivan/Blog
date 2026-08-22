const fs = require('node:fs/promises');
const path = require('node:path');
const matter = require('gray-matter');
const { chunkMarkdown, embeddingText, sha256 } = require('./lib/chunker');
const { DEFAULT_DTYPE, DEFAULT_MODEL } = require('./lib/embedder');
const { createEmbedder } = require('./lib/embedder-factory');
const { RagStore } = require('./lib/store');

const repoRoot = path.join(__dirname, '..');

function defaultOptions() {
  return {
    databasePath: process.env.RAG_DB_PATH || path.join(repoRoot, '.data', 'kernel-notes.duckdb'),
    cacheDir: process.env.RAG_MODEL_CACHE || path.join(repoRoot, '.data', 'huggingface'),
    postsDir: process.env.RAG_POSTS_DIR || path.join(repoRoot, 'posts'),
    model: process.env.RAG_MODEL || DEFAULT_MODEL,
    dtype: process.env.RAG_DTYPE || DEFAULT_DTYPE,
    embedderMode: process.env.RAG_EMBEDDER_MODE || 'e5',
    maxChars: Number(process.env.RAG_CHUNK_MAX_CHARS || 1800),
    force: false,
    quiet: false
  };
}

function parseOptions(args) {
  const options = defaultOptions();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === '--force') {
      options.force = true;
    } else if (argument === '--db' && value) {
      options.databasePath = path.resolve(value);
      index += 1;
    } else if (argument === '--posts' && value) {
      options.postsDir = path.resolve(value);
      index += 1;
    } else if (argument === '--model' && value) {
      options.model = value;
      index += 1;
    } else if (argument === '--dtype' && value) {
      options.dtype = value;
      index += 1;
    } else if (argument === '--embedder-mode' && value) {
      options.embedderMode = value;
      index += 1;
    } else if (argument === '--max-chars' && value) {
      options.maxChars = Number(value);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete option: ${argument}`);
    }
  }

  return options;
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value || '').trim();
}

async function postFiles(postsDir = defaultOptions().postsDir) {
  const entries = await fs.readdir(postsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(postsDir, entry.name))
    .sort();
}

async function readPost(filePath, sourceRoot = repoRoot) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = matter(raw);
  const slug = path.basename(filePath, '.md');
  const postId = String(parsed.data.id || slug);

  return {
    raw,
    content: parsed.content,
    document: {
      postId,
      slug,
      title: String(parsed.data.title || slug),
      category: String(parsed.data.category || ''),
      tags: Array.isArray(parsed.data.tags) ? parsed.data.tags.map(String) : [],
      excerpt: String(parsed.data.excerpt || ''),
      sourcePath: path.relative(sourceRoot, filePath),
      sourceHash: sha256(raw),
      updatedAt: normalizeDate(parsed.data.updated_at || parsed.data.date)
    }
  };
}

async function buildIndex(inputOptions = {}, dependencies = {}) {
  const options = { ...defaultOptions(), ...inputOptions };
  await fs.mkdir(path.dirname(options.databasePath), { recursive: true });
  if (options.cacheDir) {
    await fs.mkdir(options.cacheDir, { recursive: true });
  }

  const created = dependencies.embedder
    ? {
        embedder: dependencies.embedder,
        embeddingModel: dependencies.embeddingModel || options.model,
        mode: dependencies.mode || options.embedderMode
      }
    : createEmbedder({
        mode: options.embedderMode,
        model: options.model,
        dtype: options.dtype,
        cacheDir: options.cacheDir
      });

  const store = await RagStore.open(options.databasePath);
  const files = await postFiles(options.postsDir);
  const activePostIds = [];
  let indexed = 0;
  let skipped = 0;
  let chunkCount = 0;

  try {
    for (const filePath of files) {
      const { content, document } = await readPost(filePath, path.dirname(options.postsDir));
      activePostIds.push(document.postId);
      const state = await store.documentState(document.postId);
      const unchanged = state
        && state.source_hash === document.sourceHash
        && state.embedding_model === created.embeddingModel
        && Number(state.chunk_count) > 0;

      if (unchanged && !options.force) {
        skipped += 1;
        if (!options.quiet) {
          console.log(`skip  ${document.sourcePath}`);
        }
        continue;
      }

      const chunks = chunkMarkdown(content, { maxChars: options.maxChars });
      if (chunks.length === 0) {
        skipped += 1;
        if (!options.quiet) {
          console.warn(`skip  ${document.sourcePath} (no indexable content)`);
        }
        continue;
      }

      if (!options.quiet) {
        console.log(`index ${document.sourcePath} (${chunks.length} chunks)`);
      }
      const embeddings = await created.embedder.embedDocuments(
        chunks.map((chunk) => embeddingText({
          title: document.title,
          heading: chunk.heading,
          content: chunk.content
        }))
      );

      const indexedChunks = chunks.map((chunk, index) => ({
        ...chunk,
        chunkId: `${document.postId}:${chunk.ordinal}:${chunk.contentHash.slice(0, 16)}`,
        embedding: embeddings[index]
      }));

      await store.replaceDocument(document, indexedChunks, created.embeddingModel);
      indexed += 1;
      chunkCount += indexedChunks.length;
    }

    const removed = await store.removeDocumentsNotIn(activePostIds);
    return {
      databasePath: options.databasePath,
      embeddingModel: created.embeddingModel,
      embedderMode: created.mode,
      indexed,
      skipped,
      removed,
      chunkCount
    };
  } finally {
    store.close();
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const result = await buildIndex(options);

  console.log('');
  console.log(`DuckDB: ${result.databasePath}`);
  console.log(`Model:  ${result.embeddingModel} (${result.embedderMode})`);
  console.log(`Posts:  ${result.indexed} indexed, ${result.skipped} unchanged/skipped, ${result.removed} removed`);
  console.log(`Chunks: ${result.chunkCount} newly embedded`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  buildIndex,
  defaultOptions,
  normalizeDate,
  parseOptions,
  postFiles,
  readPost
};
