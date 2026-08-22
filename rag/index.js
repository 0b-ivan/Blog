const fs = require('node:fs/promises');
const path = require('node:path');
const matter = require('gray-matter');
const { chunkMarkdown, embeddingText, sha256 } = require('./lib/chunker');
const { DEFAULT_DTYPE, DEFAULT_MODEL, LocalE5Embedder } = require('./lib/embedder');
const { RagStore } = require('./lib/store');

const repoRoot = path.join(__dirname, '..');

function parseOptions(args) {
  const options = {
    databasePath: process.env.RAG_DB_PATH || path.join(repoRoot, '.data', 'kernel-notes.duckdb'),
    cacheDir: process.env.RAG_MODEL_CACHE || path.join(repoRoot, '.data', 'huggingface'),
    model: process.env.RAG_MODEL || DEFAULT_MODEL,
    dtype: process.env.RAG_DTYPE || DEFAULT_DTYPE,
    maxChars: Number(process.env.RAG_CHUNK_MAX_CHARS || 1800),
    force: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === '--force') {
      options.force = true;
    } else if (argument === '--db' && value) {
      options.databasePath = path.resolve(value);
      index += 1;
    } else if (argument === '--model' && value) {
      options.model = value;
      index += 1;
    } else if (argument === '--dtype' && value) {
      options.dtype = value;
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

async function postFiles() {
  const postsDir = path.join(repoRoot, 'posts');
  const entries = await fs.readdir(postsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(postsDir, entry.name))
    .sort();
}

async function readPost(filePath) {
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
      sourcePath: path.relative(repoRoot, filePath),
      sourceHash: sha256(raw),
      updatedAt: normalizeDate(parsed.data.updated_at || parsed.data.date)
    }
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  await fs.mkdir(path.dirname(options.databasePath), { recursive: true });

  const store = await RagStore.open(options.databasePath);
  const embedder = new LocalE5Embedder({
    model: options.model,
    dtype: options.dtype,
    cacheDir: options.cacheDir
  });

  const files = await postFiles();
  const activePostIds = [];
  let indexed = 0;
  let skipped = 0;
  let chunkCount = 0;

  try {
    for (const filePath of files) {
      const { content, document } = await readPost(filePath);
      activePostIds.push(document.postId);
      const state = await store.documentState(document.postId);
      const unchanged = state
        && state.source_hash === document.sourceHash
        && state.embedding_model === options.model
        && Number(state.chunk_count) > 0;

      if (unchanged && !options.force) {
        skipped += 1;
        console.log(`skip  ${document.sourcePath}`);
        continue;
      }

      const chunks = chunkMarkdown(content, { maxChars: options.maxChars });
      if (chunks.length === 0) {
        console.warn(`skip  ${document.sourcePath} (no indexable content)`);
        skipped += 1;
        continue;
      }

      console.log(`index ${document.sourcePath} (${chunks.length} chunks)`);
      const embeddings = await embedder.embedDocuments(
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

      await store.replaceDocument(document, indexedChunks, options.model);
      indexed += 1;
      chunkCount += indexedChunks.length;
    }

    const removed = await store.removeDocumentsNotIn(activePostIds);
    console.log('');
    console.log(`DuckDB: ${options.databasePath}`);
    console.log(`Model:  ${options.model} (${options.dtype})`);
    console.log(`Posts:  ${indexed} indexed, ${skipped} unchanged/skipped, ${removed} removed`);
    console.log(`Chunks: ${chunkCount} newly embedded`);
  } finally {
    store.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  parseOptions,
  normalizeDate,
  readPost
};
