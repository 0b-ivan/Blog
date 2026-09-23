const fs = require('node:fs/promises');
const path = require('node:path');
const matter = require('gray-matter');
const { createEmbedder } = require('../rag/lib/embedder-factory');
const { cosineSimilarity } = require('../rag/lib/ranking');

const root = path.join(__dirname, '..');
const DEFAULT_SEMANTIC_WEIGHT = 0.82;
const DEFAULT_MISMATCH_DELTA = 0.07;

function parseArgs(args) {
  const options = {
    reportsDir: '',
    postsDir: path.join(root, 'posts'),
    cacheDir: process.env.RAG_MODEL_CACHE || path.join(root, '.data', 'huggingface'),
    semanticWeight: DEFAULT_SEMANTIC_WEIGHT,
    mismatchDelta: DEFAULT_MISMATCH_DELTA
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--reports-dir' && next) {
      options.reportsDir = path.resolve(next);
      index += 1;
    } else if (arg === '--posts-dir' && next) {
      options.postsDir = path.resolve(next);
      index += 1;
    } else if (arg === '--cache-dir' && next) {
      options.cacheDir = path.resolve(next);
      index += 1;
    } else if (arg === '--semantic-weight' && next) {
      options.semanticWeight = Number(next);
      index += 1;
    } else if (arg === '--mismatch-delta' && next) {
      options.mismatchDelta = Number(next);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete option: ${arg}`);
    }
  }

  if (!options.reportsDir) throw new Error('--reports-dir is required');
  if (!Number.isFinite(options.semanticWeight) || options.semanticWeight < 0.5 || options.semanticWeight > 1) {
    throw new Error('--semantic-weight must be between 0.5 and 1');
  }
  if (!Number.isFinite(options.mismatchDelta) || options.mismatchDelta <= 0 || options.mismatchDelta > 0.3) {
    throw new Error('--mismatch-delta must be greater than 0 and at most 0.3');
  }

  return options;
}

function normalizedList(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function searchQueries(data = {}) {
  if (!Array.isArray(data.search_queries)) return [];
  return data.search_queries
    .map((entry) => typeof entry === 'string' ? entry : entry?.query)
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

function stripMarkdown(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[|*_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function articleSemanticText(raw, report = {}) {
  const parsed = matter(String(raw || ''));
  const data = parsed.data || {};
  const tags = normalizedList(data.tags);
  const body = stripMarkdown(parsed.content).slice(0, 1800);

  return [
    `Titel: ${data.title || report.title || ''}`,
    data.category ? `Kategorie: ${data.category}` : '',
    tags.length ? `Tags: ${tags.join(', ')}` : '',
    data.excerpt ? `Kurzbeschreibung: ${data.excerpt}` : '',
    searchQueries(data).length ? `Suchbegriffe: ${searchQueries(data).join('; ')}` : '',
    body ? `Artikel: ${body}` : ''
  ].filter(Boolean).join('\n').slice(0, 3600);
}

function candidateSemanticText(candidate = {}) {
  const tags = String(candidate.tags || '').trim();
  return tags
    ? `Pixabay-Foto. Inhalt und Schlagwörter: ${tags}`
    : 'Pixabay-Foto ohne beschreibende Schlagwörter';
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function semanticRelativeScore(similarity, bestSimilarity, mismatchDelta = DEFAULT_MISMATCH_DELTA) {
  const gap = Math.max(0, Number(bestSimilarity || 0) - Number(similarity || 0));
  return Math.max(0, Math.min(100, Math.round(100 - ((gap / mismatchDelta) * 35))));
}

function blendScore(semanticScore, heuristicScore, semanticWeight = DEFAULT_SEMANTIC_WEIGHT) {
  const heuristicWeight = 1 - semanticWeight;
  return Math.max(0, Math.min(100, Math.round(
    (Number(semanticScore || 0) * semanticWeight)
    + (Number(heuristicScore || 0) * heuristicWeight)
  )));
}

async function rerankReport(report, articleText, embedder, options = {}) {
  const semanticWeight = options.semanticWeight ?? DEFAULT_SEMANTIC_WEIGHT;
  const mismatchDelta = options.mismatchDelta ?? DEFAULT_MISMATCH_DELTA;
  const candidates = Array.isArray(report.candidates) ? report.candidates : [];

  if (!candidates.length) return report;

  const queryEmbedding = await embedder.embedQuery(articleText);
  const candidateTexts = candidates.map(candidateSemanticText);
  const candidateEmbeddings = await embedder.embedDocuments(candidateTexts);
  const similarities = candidateEmbeddings.map((embedding) =>
    cosineSimilarity(queryEmbedding, embedding)
  );
  const bestSimilarity = Math.max(...similarities);

  const reranked = candidates.map((candidate, index) => {
    const similarity = similarities[index];
    const semanticScore = semanticRelativeScore(similarity, bestSimilarity, mismatchDelta);
    const heuristicScore = Number(candidate.score || 0);
    const score = blendScore(semanticScore, heuristicScore, semanticWeight);
    const semanticMismatch = similarity < (bestSimilarity - mismatchDelta);

    return {
      ...candidate,
      originalRank: candidate.rank,
      heuristicScore,
      semanticSimilarity: round(similarity, 5),
      semanticScore,
      score,
      semanticMismatch,
      reasons: [
        `E5 semantic similarity ${round(similarity, 5)} (${semanticScore}/100 relative)`,
        `semantic/heuristic blend ${Math.round(semanticWeight * 100)}/${Math.round((1 - semanticWeight) * 100)}`,
        ...(Array.isArray(candidate.reasons) ? candidate.reasons : [])
      ]
    };
  }).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.semanticSimilarity !== left.semanticSimilarity) {
      return right.semanticSimilarity - left.semanticSimilarity;
    }
    return Number(right.heuristicScore || 0) - Number(left.heuristicScore || 0);
  }).map((candidate, index) => ({
    ...candidate,
    rank: index + 1
  }));

  return {
    ...report,
    semanticModel: options.embeddingModel || '',
    semanticWeight,
    semanticBestSimilarity: round(bestSimilarity, 5),
    candidates: reranked
  };
}

async function loadReportFiles(reportsDir) {
  const entries = await fs.readdir(reportsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(reportsDir, entry.name))
    .sort();
}

function resolvePostPath(report, postsDir) {
  const requested = path.resolve(root, String(report.postPath || ''));
  const safePostsDir = path.resolve(postsDir);
  if (!requested.startsWith(`${safePostsDir}${path.sep}`)) {
    throw new Error(`Report post path is outside posts directory: ${report.postPath}`);
  }
  return requested;
}

async function rerankReports(options, dependencies = {}) {
  const files = await loadReportFiles(options.reportsDir);
  if (!files.length) throw new Error('No cover candidate reports found');

  const created = dependencies.embedder
    ? {
        embedder: dependencies.embedder,
        embeddingModel: dependencies.embeddingModel || 'test-embedder'
      }
    : createEmbedder({
        mode: 'e5',
        cacheDir: options.cacheDir
      });

  for (const file of files) {
    const report = JSON.parse(await fs.readFile(file, 'utf8'));
    const postPath = resolvePostPath(report, options.postsDir);
    const raw = await fs.readFile(postPath, 'utf8');
    const articleText = articleSemanticText(raw, report);
    const reranked = await rerankReport(report, articleText, created.embedder, {
      embeddingModel: created.embeddingModel,
      semanticWeight: options.semanticWeight,
      mismatchDelta: options.mismatchDelta
    });

    await fs.writeFile(file, JSON.stringify(reranked, null, 2), 'utf8');

    const top = reranked.candidates[0];
    console.log(
      `${report.postPath}: E5 top=${top?.id || '-'} similarity=${top?.semanticSimilarity || 0} score=${top?.score || 0}/100`
    );
  }

  return files.length;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const count = await rerankReports(options);
  console.log(`Semantic cover re-ranking complete: ${count} article(s)`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_MISMATCH_DELTA,
  DEFAULT_SEMANTIC_WEIGHT,
  articleSemanticText,
  blendScore,
  candidateSemanticText,
  parseArgs,
  rerankReport,
  rerankReports,
  semanticRelativeScore,
  stripMarkdown
};
