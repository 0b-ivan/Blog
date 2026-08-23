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
  console.log(`kernel-grep ready: ${info.chunks} chunks / ${info.postProfiles} article vectors via ${info.embeddingModel}`);
}

function boundedParam(url, name, fallback, min, max) {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function graphLimit(url) {
  return boundedParam(url, 'limit', 8, 1, 12);
}

function globalGraphLimit(url) {
  return boundedParam(url, 'limit', 4, 1, 8);
}

function graphRagOptions(url) {
  return {
    seedLimit: boundedParam(url, 'seedLimit', 3, 1, 6),
    neighborsPerSeed: boundedParam(url, 'neighbors', 2, 0, 4),
    maxChunks: boundedParam(url, 'limit', 8, 1, 12),
    maxChars: boundedParam(url, 'maxChars', 12_000, 2_000, 24_000)
  };
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

    const limit = graphLimit(url);
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

  if (req.method === 'GET' && url.pathname === '/graphrag') {
    if (!ready || !engine) {
      json(res, 503, { error: 'Semantic index is still starting' });
      return;
    }

    const query = String(url.searchParams.get('q') || '').trim();
    if (query.length < 2 || query.length > 300) {
      json(res, 400, { error: 'q must contain between 2 and 300 characters' });
      return;
    }

    try {
      json(res, 200, await engine.retrieveGraphContext(query, graphRagOptions(url)));
    } catch (error) {
      console.error('kernel-grep GraphRAG retrieval failed:', error.message || error);
      json(res, 500, { error: 'GraphRAG retrieval failed' });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/graph/all') {
    if (!ready || !engine) {
      json(res, 503, { error: 'Semantic index is still starting' });
      return;
    }

    try {
      json(res, 200, engine.globalKnowledgeGraph(globalGraphLimit(url)));
    } catch (error) {
      console.error('kernel-grep global graph failed:', error.message || error);
      json(res, 500, { error: 'Global semantic knowledge graph failed' });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/graph') {
    if (!ready || !engine) {
      json(res, 503, { error: 'Semantic index is still starting' });
      return;
    }

    const slug = String(url.searchParams.get('slug') || '').trim();
    if (slug.length < 1 || slug.length > 240) {
      json(res, 400, { error: 'slug must contain between 1 and 240 characters' });
      return;
    }

    try {
      const graph = engine.knowledgeGraph(slug, graphLimit(url));
      if (!graph) {
        json(res, 404, { error: 'Article is not part of the semantic index' });
        return;
      }
      json(res, 200, graph);
    } catch (error) {
      console.error('kernel-grep graph failed:', error.message || error);
      json(res, 500, { error: 'Semantic knowledge graph failed' });
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
  graphRagOptions,
  preview
};
