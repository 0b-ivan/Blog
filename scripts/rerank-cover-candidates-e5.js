const fs = require('node:fs/promises');
const path = require('node:path');
const matter = require('gray-matter');
const { createEmbedder } = require('../rag/lib/embedder-factory');
const { cosineSimilarity } = require('../rag/lib/ranking');

const root = path.join(__dirname, '..');
const DEFAULT_SEMANTIC_WEIGHT = 0.90;
const DEFAULT_MISMATCH_DELTA = 0.07;
const ARTICLE_SEMANTIC_SHARE = 0.65;
const PROTOTYPE_SEMANTIC_SHARE = 0.35;

const COVER_CONCEPT_PROTOTYPES = {
  'writing-proofreading': {
    positive: 'writing proofreading spelling grammar text editing document keyboard manuscript corrected text language tool',
    negative: 'secretary office sales telephone call center business meeting portrait person'
  },
  'rss-reader': {
    positive: 'RSS feed reader web feed subscription aggregator syndicated website articles unread feed list RSS icon',
    negative: 'journalist press photographer newspaper reporter television news camera paparazzi'
  },
  'dependency-updates': {
    positive: 'software dependencies package updates version upgrade dependency graph source code GitHub pull request vulnerability patch',
    negative: 'physical lock safe vault key insurance house security'
  },
  'systemd-service': {
    positive: 'Linux system service daemon command line shell logs journal process server administration',
    negative: 'train station airport terminal transport computer repair electronics hardware'
  },
  'docker-compose': {
    positive: 'software deployment DevOps application services orchestration compose configuration code terminal',
    negative: 'shipping cargo port freight metal container box jar can storage vessel'
  },
  'semantic-search': {
    positive: 'semantic search embeddings vector search similarity ranking data retrieval code search index',
    negative: 'social media search engine smartphone robot portrait generic artificial intelligence human'
  },
  'vpc-networking': {
    positive: 'cloud network topology subnet routing route table router internet gateway private network architecture diagram',
    negative: 'social media network people icons smartphone generic server rack database storage'
  },
  'chaos-engineering': {
    positive: 'site reliability engineering resilience failure injection outage monitoring incident recovery infrastructure reliability experiment',
    negative: 'school exam chemistry laboratory medical experiment business management sales'
  },
  'regression-testing': {
    positive: 'software regression testing automated tests bug quality assurance test suite continuous integration code failure',
    negative: 'school exam laboratory medical test car crash business meeting'
  },
  'logging-observability': {
    positive: 'software logs observability metrics monitoring alerts dashboard log lines terminal server application telemetry',
    negative: 'car dashboard speedometer vehicle smartphone photography game'
  },
  'photo-storage-sync': {
    positive: 'photo library gallery cloud sync backup files images photo management storage synchronization',
    negative: 'airplane fighter aircraft warehouse self storage tourist photographer music business'
  }
};

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

function conceptPrototype(report = {}) {
  const key = String(report.visualIntent || '').trim();
  if (!key) return null;
  const prototype = COVER_CONCEPT_PROTOTYPES[key];
  return prototype ? { key, ...prototype } : null;
}

function prototypeMarginScore(margin) {
  return Math.max(0, Math.min(100, Math.round(50 + (Number(margin || 0) * 600))));
}

function combinedSemanticScore(articleScore, prototypeScore, hasPrototype) {
  if (!hasPrototype) return Math.max(0, Math.min(100, Math.round(Number(articleScore || 0))));
  return Math.max(0, Math.min(100, Math.round(
    (Number(articleScore || 0) * ARTICLE_SEMANTIC_SHARE)
    + (Number(prototypeScore || 0) * PROTOTYPE_SEMANTIC_SHARE)
  )));
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

  const prototype = conceptPrototype(report);
  const queryEmbedding = await embedder.embedQuery(articleText);
  const positivePrototypeEmbedding = prototype
    ? await embedder.embedQuery(prototype.positive)
    : null;
  const negativePrototypeEmbedding = prototype
    ? await embedder.embedQuery(prototype.negative)
    : null;

  const candidateTexts = candidates.map(candidateSemanticText);
  const candidateEmbeddings = await embedder.embedDocuments(candidateTexts);
  const similarities = candidateEmbeddings.map((embedding) =>
    cosineSimilarity(queryEmbedding, embedding)
  );
  const bestSimilarity = Math.max(...similarities);

  const reranked = candidates.map((candidate, index) => {
    const similarity = similarities[index];
    const articleSemanticScore = semanticRelativeScore(similarity, bestSimilarity, mismatchDelta);
    const heuristicScore = Number(candidate.score || 0);

    const positiveSimilarity = prototype
      ? cosineSimilarity(positivePrototypeEmbedding, candidateEmbeddings[index])
      : null;
    const negativeSimilarity = prototype
      ? cosineSimilarity(negativePrototypeEmbedding, candidateEmbeddings[index])
      : null;
    const prototypeMargin = prototype
      ? Number(positiveSimilarity) - Number(negativeSimilarity)
      : null;
    const prototypeScore = prototype
      ? prototypeMarginScore(prototypeMargin)
      : null;
    const semanticScore = combinedSemanticScore(
      articleSemanticScore,
      prototypeScore,
      Boolean(prototype)
    );
    const score = blendScore(semanticScore, heuristicScore, semanticWeight);
    const articleMismatch = similarity < (bestSimilarity - mismatchDelta);
    const prototypeMismatch = Boolean(
      prototype && Number(positiveSimilarity) <= Number(negativeSimilarity)
    );
    const semanticMismatch = articleMismatch || prototypeMismatch;

    return {
      ...candidate,
      originalRank: candidate.rank,
      heuristicScore,
      semanticSimilarity: round(similarity, 5),
      articleSemanticScore,
      prototypeKey: prototype?.key || '',
      prototypePositiveSimilarity: prototype ? round(positiveSimilarity, 5) : null,
      prototypeNegativeSimilarity: prototype ? round(negativeSimilarity, 5) : null,
      prototypeMargin: prototype ? round(prototypeMargin, 5) : null,
      prototypeScore,
      semanticScore,
      score,
      semanticMismatch,
      prototypeMismatch,
      reasons: [
        `E5 article similarity ${round(similarity, 5)} (${articleSemanticScore}/100 relative)`,
        prototype
          ? `E5 concept margin ${round(prototypeMargin, 5)} (positive ${round(positiveSimilarity, 5)} vs negative ${round(negativeSimilarity, 5)}; ${prototypeScore}/100)`
          : '',
        prototype
          ? `semantic mix ${Math.round(ARTICLE_SEMANTIC_SHARE * 100)}/${Math.round(PROTOTYPE_SEMANTIC_SHARE * 100)} article/concept`
          : '',
        `semantic/heuristic blend ${Math.round(semanticWeight * 100)}/${Math.round((1 - semanticWeight) * 100)}`,
        ...(Array.isArray(candidate.reasons) ? candidate.reasons : [])
      ].filter(Boolean)
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
    semanticPrototype: prototype?.key || '',
    semanticPrototypePositive: prototype?.positive || '',
    semanticPrototypeNegative: prototype?.negative || '',
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
  ARTICLE_SEMANTIC_SHARE,
  COVER_CONCEPT_PROTOTYPES,
  DEFAULT_MISMATCH_DELTA,
  DEFAULT_SEMANTIC_WEIGHT,
  PROTOTYPE_SEMANTIC_SHARE,
  articleSemanticText,
  blendScore,
  candidateSemanticText,
  combinedSemanticScore,
  conceptPrototype,
  parseArgs,
  prototypeMarginScore,
  rerankReport,
  rerankReports,
  semanticRelativeScore,
  stripMarkdown
};
