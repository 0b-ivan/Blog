const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const { SemanticSearchEngine } = require('./lib/search-engine');

const port = Number(process.env.PORT || 8090);
const host = process.env.HOST || '0.0.0.0';
const repoRoot = path.join(__dirname, '..');

let engine = null;
let ready = false;
let shuttingDown = false;

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

function preview(value, maxLength = 520) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

async function initialize() {
  engine = await SemanticSearchEngine.create({
    databasePath: process.env.RAG_DB_PATH || '/data/kernel-notes.duckdb',
    cacheDir: process.env.RAG_MODEL_CACHE || '/models',
    postsDir: process.env.RAG_POSTS_DIR || path.join(repoRoot, 'posts'),
    embedderMode: process.env.RAG_EMBEDDER_MODE || 'e5',
    model: process.env.RAG_MODEL,
    dtype: process.env.RAG_DTYPE,
    maxChars: Number(process.env.RAG_CHUNK_MAX_CHARS || 1800)
  });
  ready = true;
  const info = engine.info();
  console.log(`kernel-grep ready: ${info.chunks} chunks via ${info.embeddingModel}`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/healthz') {
    json(res, ready ? 200 : 503, {
      status: ready ? 'ok' : 'starting',
      ready,
      ...(ready ? { index: engine.info() } : {})
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/search') {
    if (!ready || !engine) {
      json(res, 503, { error: 'Semantic index is still starting' });
      return;
    }

    const query = String(url.searchParams.get('q') || '').trim();
    if (query.length < 2 || query.length > 300) {
      json(res, 400, { error: 'q must contain between 2 and 300 characters' });
      return;
    }

    const limit = Math.min(12, Math.max(1, Number(url.searchParams.get('limit')) || 8));
    try {
      const results = await engine.search(query, limit);
      json(res, 200, {
        query,
        results: results.map((result) => ({
          ...result,
          content: preview(result.content)
        }))
      });
    } catch (error) {
      console.error('kernel-grep search failed:', error.message || error);
      json(res, 500, { error: 'Semantic search failed' });
    }
    return;
  }

  json(res, 404, { error: 'Not found' });
});

async function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  ready = false;
  if (engine) {
    engine.close();
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(port, host, () => {
  console.log(`kernel-grep listening on ${host}:${port}`);
  initialize().catch((error) => {
    console.error('kernel-grep initialization failed:', error);
    process.exit(1);
  });
});

module.exports = {
  preview
};
