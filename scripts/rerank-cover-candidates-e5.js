const fs = require('node:fs/promises');
const path = require('node:path');
const matter = require('gray-matter');
const { createEmbedder } = require('../rag/lib/embedder-factory');
const { cosineSimilarity } = require('../rag/lib/ranking');

const root = path.join(__dirname, '..');
const DEFAULT_SEMANTIC_WEIGHT = 0.80;
const DEFAULT_MISMATCH_DELTA = 0.07;
const ARTICLE_SEMANTIC_SHARE = 0.65;
const PROTOTYPE_SEMANTIC_SHARE = 0.35;
const HERO_QUALITY_WEIGHT = 0.15;
const HEURISTIC_WEIGHT = 0.05;

const GENERIC_ICON_TERMS = ['icon', 'logo', 'symbol', 'button', 'sign', 'isolated'];
const GENERIC_ERROR_TERMS = ['error', 'cross', 'warning', 'wrong', 'false', 'mistake', 'failure sign'];
const GENERIC_SCREEN_TERMS = ['screenshot', 'screen', 'window', 'terminal', 'cmd', 'console', 'prompt', 'scroll', 'minimize'];

const COVER_CONCEPT_PROTOTYPES = {
  'pokemon-oop-domain-model': {
    positive: 'handheld role playing game creature monster fantasy battle combat duel versus turn based game scene two creatures facing each other',
    negative: 'Mario Super Mario Zelda Link Sonic Kirby Minecraft Fortnite branded character toy figure doll plush trading card cassette tape recorder music album unrelated object unrelated franchise mascot',
    heroPreferred: ['handheld', 'console', 'game', 'rpg', 'creature', 'monster', 'battle', 'combat', 'fight', 'duel', 'versus'],
    heroRequired: ['battle', 'combat', 'fight', 'fighting', 'duel', 'versus'],
    heroAvoid: ['mario', 'super mario', 'zelda', 'link', 'sonic', 'kirby', 'minecraft', 'fortnite', 'figure', 'toy', 'plush', 'doll', 'trading card', 'cassette', 'tape', 'recorder', 'music', 'album'],
    minHeroQuality: 70
  },
  'writing-proofreading': {
    positive: 'writing proofreading spelling grammar text editing document keyboard manuscript corrected text language tool',
    negative: 'secretary office sales telephone call center business meeting portrait person'
  },
  'rss-reader': {
    positive: 'RSS feed reader dashboard web feed subscription aggregator syndication browser feed list unread articles feed application',
    negative: 'internet speed speedometer download upload broadband performance RSS logo RSS icon icon symbol button isolated journalist press photographer newspaper reporter television news camera paparazzi account registration sign up login password membership user account',
    heroPreferred: ['dashboard', 'reader', 'aggregator', 'browser', 'subscription', 'feed'],
    heroRequired: ['dashboard', 'reader', 'aggregator', 'browser', 'subscription', 'interface', 'feed list'],
    heroAvoid: ['speed', 'speedometer', 'download', 'upload', 'icon', 'logo', 'symbol', 'button', 'isolated'],
    minHeroQuality: 55
  },
  'dependency-updates': {
    positive: 'software dependencies package updates version upgrade dependency graph source code GitHub pull request vulnerability patch',
    negative: 'physical lock safe vault key insurance house security'
  },
  'systemd-service': {
    positive: 'Linux systemd service daemon journalctl service logs process server administration monitoring unit file operations',
    negative: 'generic server room datacenter empty terminal screenshot terminal window command prompt cmd console scroll minimize train station airport transport computer repair electronics hardware turtle animal nature wooden log timber wallpaper',
    heroPreferred: ['service', 'logs', 'monitoring', 'daemon', 'process', 'administration', 'server'],
    heroRequired: ['service', 'logs', 'monitoring', 'daemon', 'process', 'administration'],
    heroAvoid: ['server room', 'datacenter', 'screenshot', 'window', 'terminal', 'cmd', 'console', 'prompt', 'scroll', 'minimize'],
    minHeroQuality: 55
  },
  'docker-compose': {
    positive: 'software deployment DevOps application services orchestration compose configuration architecture workflow automation',
    negative: 'generic code screen terminal screenshot wallpaper programming laptop shipping cargo port freight metal container box jar can storage vessel',
    heroPreferred: ['deployment', 'devops', 'services', 'orchestration', 'configuration', 'architecture', 'workflow', 'automation'],
    heroRequired: ['deployment', 'devops', 'orchestration', 'configuration', 'architecture', 'workflow', 'automation'],
    heroAvoid: ['screen', 'terminal', 'screenshot', 'wallpaper', 'laptop'],
    minHeroQuality: 50
  },
  'semantic-search': {
    positive: 'semantic search embeddings vector database vector search similarity ranking nearest neighbor retrieval index query search results knowledge graph',
    negative: 'generic programmer software engineer coding laptop source code screen terminal screenshot social media search engine smartphone robot portrait human',
    heroPreferred: ['search', 'magnifying', 'vector', 'graph', 'data', 'index', 'retrieval'],
    heroAvoid: ['programmer', 'coding', 'screen', 'terminal', 'screenshot']
  },
  'vpc-networking': {
    positive: 'cloud network topology subnet routing route table router internet gateway private network architecture diagram',
    negative: 'social media network people icons smartphone generic server rack database storage'
  },
  'chaos-monkey': {
    positive: 'monkey ape primate chimpanzee macaque baboon playful chaos resilience technology infrastructure',
    negative: 'red cross error icon warning sign button GUI interface generic failure symbol',
    heroPreferred: ['monkey', 'ape', 'primate', 'chimpanzee', 'macaque', 'baboon'],
    heroRequired: ['monkey', 'ape', 'primate', 'chimpanzee', 'macaque', 'baboon'],
    heroAvoid: ['error', 'cross', 'warning', 'sign', 'icon', 'symbol', 'button', 'interface', 'gui'],
    minHeroQuality: 70
  },
  'chaos-engineering': {
    positive: 'site reliability engineering resilience failure injection outage monitoring incident recovery infrastructure reliability experiment',
    negative: 'red cross error icon warning sign button school exam chemistry laboratory medical experiment business management sales',
    heroPreferred: ['resilience', 'monitoring', 'outage', 'incident', 'infrastructure', 'recovery', 'failure'],
    heroAvoid: ['error', 'cross', 'warning', 'sign', 'icon', 'symbol', 'button']
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
  const override = key ? COVER_CONCEPT_PROTOTYPES[key] : null;
  const briefPositive = String(report.visualBriefPositive || '').trim();
  const briefNegative = String(report.visualBriefNegative || '').trim();

  if (!override && !briefPositive) return null;

  const generic = {
    key: key || 'article-visual-brief',
    positive: briefPositive,
    negative: briefNegative,
    source: key ? 'article+intent' : 'article'
  };

  if (!override) return generic;

  return {
    ...generic,
    ...override,
    key,
    positive: [briefPositive, override.positive].filter(Boolean).join(' '),
    negative: [briefNegative, override.negative].filter(Boolean).join(' ')
  };
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

function matchTerms(tags, terms = []) {
  const haystack = String(tags || '').toLowerCase();
  return [...new Set(terms.filter((term) => haystack.includes(String(term).toLowerCase())))];
}

function heroQuality(candidate = {}, prototype = null) {
  const tags = String(candidate.tags || '');
  let score = 70;
  const reasons = [];

  const iconMatches = matchTerms(tags, GENERIC_ICON_TERMS);
  if (iconMatches.length) {
    const penalty = Math.min(36, 12 + ((iconMatches.length - 1) * 8));
    score -= penalty;
    reasons.push(`-${penalty} generic icon/logo: ${iconMatches.slice(0, 4).join(', ')}`);
  }

  const errorMatches = matchTerms(tags, GENERIC_ERROR_TERMS);
  if (errorMatches.length) {
    const penalty = Math.min(32, 10 + ((errorMatches.length - 1) * 7));
    score -= penalty;
    reasons.push(`-${penalty} generic error motif: ${errorMatches.slice(0, 4).join(', ')}`);
  }

  const screenMatches = matchTerms(tags, GENERIC_SCREEN_TERMS);
  if (screenMatches.length >= 2) {
    const penalty = Math.min(28, 8 + ((screenMatches.length - 2) * 5));
    score -= penalty;
    reasons.push(`-${penalty} generic screen/terminal: ${screenMatches.slice(0, 5).join(', ')}`);
  }

  const preferred = matchTerms(tags, prototype?.heroPreferred || []);
  if (preferred.length) {
    const bonus = Math.min(30, preferred.length * 8);
    score += bonus;
    reasons.push(`+${bonus} hero motif: ${preferred.slice(0, 4).join(', ')}`);
  }

  const requiredHero = matchTerms(tags, prototype?.heroRequired || []);
  if ((prototype?.heroRequired || []).length && requiredHero.length === 0) {
    score -= 35;
    reasons.push('-35 no rich hero motif');
  }

  const imageType = String(candidate.imageType || '').toLowerCase();
  if (imageType === 'vector' && (prototype?.heroRequired || []).length && requiredHero.length === 0) {
    score -= 10;
    reasons.push('-10 generic vector without rich motif');
  }

  const avoided = matchTerms(tags, prototype?.heroAvoid || []);
  if (avoided.length) {
    const penalty = Math.min(42, avoided.length * 12);
    score -= penalty;
    reasons.push(`-${penalty} intent hero avoid: ${avoided.slice(0, 4).join(', ')}`);
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    preferred,
    requiredHero,
    avoided,
    imageType,
    iconMatches,
    errorMatches,
    screenMatches
  };
}

function blendCoverScore(semanticScore, heroScore, heuristicScore, semanticWeight = DEFAULT_SEMANTIC_WEIGHT) {
  const semantic = Number(semanticScore || 0) * semanticWeight;
  const hero = Number(heroScore || 0) * HERO_QUALITY_WEIGHT;
  const heuristic = Number(heuristicScore || 0) * HEURISTIC_WEIGHT;
  return Math.max(0, Math.min(100, Math.round(semantic + hero + heuristic)));
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
    const hero = heroQuality(candidate, prototype);
    const score = blendCoverScore(semanticScore, hero.score, heuristicScore, semanticWeight);
    const articleMismatch = similarity < (bestSimilarity - mismatchDelta);
    const prototypeMismatch = Boolean(
      prototype && Number(positiveSimilarity) <= Number(negativeSimilarity)
    );
    const resolverMismatch = Boolean(candidate.semanticMismatch);
    const heroMismatch = Boolean(
      prototype?.minHeroQuality && hero.score < Number(prototype.minHeroQuality)
    );
    const semanticMismatch = resolverMismatch || articleMismatch || prototypeMismatch || heroMismatch;

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
      heroQualityScore: hero.score,
      heroQualityReasons: hero.reasons,
      heroPreferredMatches: hero.preferred,
      heroAvoidMatches: hero.avoided,
      heroRequiredMatches: hero.requiredHero,
      score,
      semanticMismatch,
      resolverMismatch,
      prototypeMismatch,
      heroMismatch,
      reasons: [
        `E5 article similarity ${round(similarity, 5)} (${articleSemanticScore}/100 relative)`,
        prototype
          ? `E5 concept margin ${round(prototypeMargin, 5)} (positive ${round(positiveSimilarity, 5)} vs negative ${round(negativeSimilarity, 5)}; ${prototypeScore}/100)`
          : '',
        prototype
          ? `semantic mix ${Math.round(ARTICLE_SEMANTIC_SHARE * 100)}/${Math.round(PROTOTYPE_SEMANTIC_SHARE * 100)} article/concept`
          : '',
        `final blend ${Math.round(semanticWeight * 100)}/${Math.round(HERO_QUALITY_WEIGHT * 100)}/${Math.round(HEURISTIC_WEIGHT * 100)} semantic/hero/heuristic`,
        ...hero.reasons,
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
    semanticPrototypeSource: prototype?.source || '',
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
  GENERIC_ERROR_TERMS,
  GENERIC_ICON_TERMS,
  GENERIC_SCREEN_TERMS,
  HERO_QUALITY_WEIGHT,
  HEURISTIC_WEIGHT,
  PROTOTYPE_SEMANTIC_SHARE,
  articleSemanticText,
  blendCoverScore,
  blendScore,
  candidateSemanticText,
  combinedSemanticScore,
  conceptPrototype,
  heroQuality,
  matchTerms,
  parseArgs,
  prototypeMarginScore,
  rerankReport,
  rerankReports,
  semanticRelativeScore,
  stripMarkdown
};
